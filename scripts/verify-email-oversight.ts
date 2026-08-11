/* Phase 20B verification: seeds three email threads across two reps and
   asserts the oversight queries classify them correctly.

   Run:    npx tsx --env-file=.env scripts/verify-email-oversight.ts
   Clean:  npx tsx --env-file=.env scripts/verify-email-oversight.ts --clean

   Without --clean the threads are left in place so the dashboard card, the
   team inbox, and the rep drill-down can be eyeballed in the browser.
*/
import { prisma } from "../src/lib/prisma";
import {
  getUnansweredThreads,
  getRepEmailStats,
} from "../src/lib/email-oversight";

const TAG = "verify20b";
const day = 86_400_000;
const now = Date.now();

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`
  );
}

async function clean() {
  const { count } = await prisma.message.deleteMany({
    where: { providerThreadId: { startsWith: TAG } },
  });
  console.log(`Removed ${count} verification message(s).`);
}

async function main() {
  if (process.argv.includes("--clean")) return clean();

  // Start from a clean slate so re-runs are idempotent.
  await clean();

  const reps = await prisma.user.findMany({
    where: { isActive: true, subscriptions: { some: {} } },
    orderBy: { name: "asc" },
    take: 2,
    select: { id: true, name: true },
  });
  if (reps.length < 2) throw new Error("Need two reps with subscriptions.");
  const [repA, repB] = reps;

  const company = await prisma.company.findFirstOrThrow({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  console.log(
    `Rep A: ${repA.name}\nRep B: ${repB.name}\nCompany: ${company.name}\n`
  );

  function msg(
    thread: string,
    direction: "IN" | "OUT",
    daysAgo: number,
    authorId: string | null
  ) {
    return prisma.message.create({
      data: {
        channel: "EMAIL",
        direction,
        subject: `[${thread}] Trailer coverage for the north lot`,
        body:
          direction === "OUT"
            ? "Attaching the quote for the additional units."
            : "Thanks — can you confirm the delivery window?",
        fromAddress:
          direction === "OUT" ? "rep@bigview.ai" : "pm@example-contractor.com",
        toAddress:
          direction === "OUT" ? "pm@example-contractor.com" : "rep@bigview.ai",
        providerThreadId: thread,
        providerMessageId: `${thread}-${direction}-${daysAgo}`,
        deliveryStatus: direction === "OUT" ? "SENT" : null,
        authorId,
        companyId: company.id,
        createdAt: new Date(now - daysAgo * day),
      },
    });
  }

  // Thread 1 (rep A): customer spoke last 3 days ago -> UNANSWERED, 3d.
  await msg(`${TAG}-1`, "OUT", 5, repA.id);
  await msg(`${TAG}-1`, "IN", 3, null);
  // Thread 2 (rep A): rep replied after the customer -> answered.
  await msg(`${TAG}-2`, "OUT", 9, repA.id);
  await msg(`${TAG}-2`, "IN", 8, null);
  await msg(`${TAG}-2`, "OUT", 7, repA.id);
  // Thread 3 (rep B): customer spoke last today -> UNANSWERED, 0d.
  await msg(`${TAG}-3`, "OUT", 1, repB.id);
  await msg(`${TAG}-3`, "IN", 0, null);

  const all = (await getUnansweredThreads()).filter((t) =>
    t.threadId.startsWith(TAG)
  );
  check(
    "admin view lists both waiting threads, longest first",
    all.map((t) => t.threadId),
    [`${TAG}-1`, `${TAG}-3`]
  );
  check("thread 1 attributed to rep A", all[0]?.repName, repA.name);
  check("thread 1 days waiting", all[0]?.daysWaiting, 3);
  check("thread 3 attributed to rep B", all[1]?.repName, repB.name);
  check("thread 3 days waiting", all[1]?.daysWaiting, 0);
  check("customer resolved from the record", all[0]?.customer, company.name);
  check("record link points at the company", all[0]?.href, `/companies/${company.id}`);

  const scopedA = (await getUnansweredThreads(repA.id)).filter((t) =>
    t.threadId.startsWith(TAG)
  );
  check(
    "rep A sees only their own waiting thread",
    scopedA.map((t) => t.threadId),
    [`${TAG}-1`]
  );

  const statsA = await getRepEmailStats(repA.id);
  const seededA = statsA.recent.filter((m) => m.subject?.includes(TAG));
  check("rep A recent email includes all 5 seeded messages", seededA.length, 5);
  check(
    "rep A unanswered count",
    statsA.unanswered.filter((t) => t.threadId.startsWith(TAG)).length,
    1
  );
  console.log(
    `\nRep A totals — sent ${statsA.sent}, this week ${statsA.sentThisWeek}, received ${statsA.received}, unanswered ${statsA.unanswered.length}`
  );

  // Answer thread 1 and confirm it drops off.
  await msg(`${TAG}-1`, "OUT", 0, repA.id);
  const after = (await getUnansweredThreads()).filter((t) =>
    t.threadId.startsWith(TAG)
  );
  check(
    "replying clears the thread from the waiting list",
    after.map((t) => t.threadId),
    [`${TAG}-3`]
  );

  console.log(
    failures === 0
      ? "\nAll checks passed. Seeded threads left in place for a visual pass."
      : `\n${failures} check(s) FAILED.`
  );
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
