/* Phase 24 data migration: reshape existing leads onto the two tracks.

   Report:  npx tsx --env-file=.env scripts/migrate-lead-tracks.ts
   Apply:   npx tsx --env-file=.env scripts/migrate-lead-tracks.ts --apply
   Force:   ... --apply --as-project=<id,id> --as-company=<id,id>

   Dry-run is the default on purpose: this retypes records and creates rows, so
   forgetting the flag should produce a report, not a mutation.

   Two passes:
     1. Classify NEW_COMPANY leads. Job-shaped ones become NEW_PROJECT.
     2. Give every NEW_PROJECT lead a Project — without one there's nothing for
        trailers to deploy onto, and the repeat-rate KPI can't see the job.

   Idempotent by natural key: pass 1 only looks at NEW_COMPANY, pass 2 only at
   projectId = null, so a second run finds nothing to do.
*/
import { prisma } from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");

function idsFromFlag(flag: string): Set<string> {
  const arg = process.argv.find((a) => a.startsWith(`${flag}=`));
  return new Set(
    arg
      ? arg
          .slice(flag.length + 1)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : []
  );
}
const forceProject = idsFromFlag("--as-project");
const forceCompany = idsFromFlag("--as-company");

// Matches the seeded project vocabulary in scripts/seed-demo.ts.
const PROJECT_KINDS = [
  "Distribution Center", "Retail Pad", "Apartment Complex", "Roadway Widening",
  "Substation", "Solar Farm", "Warehouse", "Medical Office", "Bridge Rehab",
  "Laydown Yard", "School Addition", "Parking Structure", "Interchange",
  "Logistics Hub", "Mixed-Use Tower", "Water Treatment", "Storage Facility",
];

const RELATIONSHIP_HINT =
  /\b(intro|introduction|prospect(ing)?|vendor|pre-?qual\w*|bid list|approved vendor|relationship|cold call|outreach|get on the list)\b/i;

/** Strip the company prefix: "Acme — Tampa Bridge Rehab" -> "Tampa Bridge Rehab" */
function deriveProjectName(title: string, companyName: string | null): string {
  let n = title.trim();
  if (companyName && n.toLowerCase().startsWith(companyName.toLowerCase())) {
    n = n.slice(companyName.length).replace(/^\s*[—–-]\s*/, "").trim();
  }
  return n.length >= 3 ? n : title.trim();
}

type Bucket = "RETYPE" | "KEEP" | "AMBIGUOUS" | "SKIP";

async function main() {
  console.log(
    APPLY ? "APPLYING changes.\n" : "Dry run — no writes. Add --apply to commit.\n"
  );

  // ---- Pass 1: classify NEW_COMPANY leads ----
  const orgLeads = await prisma.lead.findMany({
    where: { type: "NEW_COMPANY" },
    select: {
      id: true,
      title: true,
      stage: true,
      estMrr: true,
      estValue: true,
      estMonths: true,
      projectId: true,
      companyId: true,
      company: { select: { name: true } },
      _count: { select: { quotes: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const groups: Record<Bucket, string[]> = {
    RETYPE: [],
    KEEP: [],
    AMBIGUOUS: [],
    SKIP: [],
  };
  const toRetype: typeof orgLeads = [];
  const toClearEconomics: typeof orgLeads = [];

  for (const lead of orgLeads) {
    // Unambiguous artifacts of a real job — these override the title.
    const hardJob =
      lead.projectId !== null ||
      lead._count.quotes > 0 ||
      lead.stage === "QUOTE_SENT" ||
      lead.stage === "WON";
    // Weak evidence: migration 20260810214426 backfilled estMrr from estValue
    // across the board, so economics alone prove very little.
    const softJob = lead.estMrr !== null || lead.estValue !== null;
    const jobHint = PROJECT_KINDS.some((k) =>
      lead.title.toLowerCase().includes(k.toLowerCase())
    );
    const relHint = RELATIONSHIP_HINT.test(lead.title);

    let bucket: Bucket;
    let why: string;
    if (forceProject.has(lead.id)) {
      bucket = "RETYPE";
      why = "forced via --as-project";
    } else if (forceCompany.has(lead.id)) {
      bucket = "KEEP";
      why = "forced via --as-company";
    } else if (hardJob) {
      bucket = "RETYPE";
      why = `hard evidence (${[
        lead.projectId && "has project",
        lead._count.quotes > 0 && `${lead._count.quotes} quote(s)`,
        (lead.stage === "QUOTE_SENT" || lead.stage === "WON") &&
          `stage ${lead.stage}`,
      ]
        .filter(Boolean)
        .join(", ")})`;
    } else if (softJob && jobHint) {
      bucket = "RETYPE";
      const kind = PROJECT_KINDS.find((k) =>
        lead.title.toLowerCase().includes(k.toLowerCase())
      );
      why = `economics + project-shaped title ("${kind}")`;
    } else if (softJob) {
      // Economics but no clear signal either way — never guessed at.
      bucket = "AMBIGUOUS";
      why = relHint
        ? "economics but a relationship-shaped title — likely a genuine prospecting lead"
        : "economics but no title signal either way";
    } else {
      bucket = "KEEP";
      why = "no economics, no job artifacts";
    }

    if (bucket === "RETYPE" && !lead.companyId) {
      // Project.companyId is NOT NULL, and inventing a placeholder Company
      // would pollute the repeat-rate KPI forever.
      bucket = "SKIP";
      why = "job-shaped but has no company — cannot create a Project";
    }

    const money = [
      lead.estMrr && `estMrr=${lead.estMrr}`,
      lead.estValue && `estValue=${lead.estValue}`,
    ]
      .filter(Boolean)
      .join(" ");
    groups[bucket].push(
      `  ${lead.id}  "${lead.title}"  stage=${lead.stage}${money ? ` ${money}` : ""}\n` +
        `      why: ${why}`
    );
    if (bucket === "RETYPE") toRetype.push(lead);
    if (bucket === "KEEP" && (lead.estMrr || lead.estValue || lead.estMonths))
      toClearEconomics.push(lead);
  }

  for (const [bucket, lines] of Object.entries(groups)) {
    if (lines.length === 0) continue;
    const note =
      bucket === "AMBIGUOUS"
        ? "  [no action — resolve with --as-project / --as-company]"
        : bucket === "SKIP"
          ? "  [no action — needs manual triage]"
          : "";
    console.log(`${bucket} (${lines.length})${note}`);
    console.log(lines.join("\n"));
    console.log();
  }

  if (toClearEconomics.length > 0) {
    console.log(
      `Will null estMrr/estMonths/estValue on ${toClearEconomics.length} lead(s) staying on the organization track.\n`
    );
  }

  if (APPLY) {
    for (const lead of toRetype) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { type: "NEW_PROJECT" },
      });
    }
    for (const lead of toClearEconomics) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { estMrr: null, estMonths: null, estValue: null },
      });
    }
    console.log(
      `Retyped ${toRetype.length} lead(s); cleared economics on ${toClearEconomics.length}.\n`
    );
  }

  // ---- Pass 2: every project lead needs a Project ----
  // Re-read so retyped leads from pass 1 are included.
  const needProject = await prisma.lead.findMany({
    where: APPLY
      ? { type: "NEW_PROJECT", projectId: null }
      : {
          projectId: null,
          OR: [
            { type: "NEW_PROJECT" },
            { id: { in: toRetype.map((l) => l.id) } },
          ],
        },
    select: {
      id: true,
      title: true,
      companyId: true,
      company: { select: { name: true } },
      quotes: {
        select: {
          id: true,
          projectId: true,
          subscriptions: {
            select: { id: true, status: true, startDate: true, projectId: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(
    `PASS 2 — project leads missing a Project (${needProject.length})`
  );

  let created = 0;
  let reused = 0;
  let skipped = 0;
  let backfilled = 0;

  for (const lead of needProject) {
    if (!lead.companyId) {
      console.log(
        `  SKIP ${lead.id} "${lead.title}" — no company, cannot create a Project`
      );
      skipped++;
      continue;
    }
    const name = deriveProjectName(lead.title, lead.company?.name ?? null);

    // An exact match with no subscription is safe to reuse. One that already
    // has a live subscription is a different job — attaching an open lead to it
    // would corrupt the repeat-rate KPI and the dispatch suggestions.
    const existing = await prisma.project.findFirst({
      where: {
        companyId: lead.companyId,
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true, name: true, _count: { select: { subscriptions: true } } },
    });
    const near = existing
      ? null
      : await prisma.project.findFirst({
          where: {
            companyId: lead.companyId,
            name: { startsWith: name, mode: "insensitive" },
          },
          select: { name: true },
        });

    const reuse = existing && existing._count.subscriptions === 0;

    // A won lead with a live subscription needs the Project wired through to
    // the quote and subscription too, or the job stays invisible to the KPIs.
    const sub = lead.quotes.flatMap((q) => q.subscriptions)[0];
    const status = sub
      ? sub.status === "ENDED"
        ? "COMPLETED"
        : "ACTIVE"
      : "UPCOMING";

    console.log(
      `  ${reuse ? "REUSE" : "CREATE"} "${name}" @ ${lead.company?.name}` +
        ` for ${lead.id} "${lead.title}"` +
        (status !== "UPCOMING" ? ` [status ${status} from subscription]` : "") +
        (near ? `\n      near-match exists: "${near.name}" — review` : "") +
        (existing && !reuse
          ? `\n      exact name exists but has a subscription — creating a separate Project`
          : "")
    );

    if (!APPLY) {
      reuse ? reused++ : created++;
      continue;
    }

    const projectId = reuse
      ? existing!.id
      : (
          await prisma.project.create({
            data: {
              name,
              companyId: lead.companyId,
              status,
              expectedStart: sub?.startDate ?? undefined,
              notes: `Created by the two-track lead migration from lead ${lead.id}.`,
            },
            select: { id: true },
          })
        ).id;
    reuse ? reused++ : created++;

    await prisma.lead.update({ where: { id: lead.id }, data: { projectId } });

    for (const q of lead.quotes) {
      if (!q.projectId) {
        await prisma.quote.update({
          where: { id: q.id },
          data: { projectId },
        });
        backfilled++;
      }
      for (const s of q.subscriptions) {
        if (!s.projectId) {
          await prisma.subscription.update({
            where: { id: s.id },
            data: { projectId },
          });
          backfilled++;
        }
      }
    }
  }

  console.log(
    `\nPass 2: ${created} project(s) to create, ${reused} reused, ${skipped} skipped` +
      (APPLY ? `, ${backfilled} quote/subscription link(s) backfilled.` : ".")
  );
  console.log(
    APPLY
      ? "\nDone."
      : "\nDry run complete. Re-run with --apply to write."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
