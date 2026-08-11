import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { LeadFormDialog } from "@/components/leads/lead-form-dialog";
import { LeadsKanban, type KanbanLead } from "@/components/leads/leads-kanban";
import {
  LeadsTable,
  type LeadRow,
  type SortKey,
} from "@/components/leads/leads-table";
import { Card, CardContent } from "@/components/ui/card";
import { fullName, formatCurrency } from "@/lib/format";
import { SearchInput } from "@/components/layout/search-input";
import { FilterPills } from "@/components/layout/filter-pills";
import { cn } from "@/lib/utils";
import {
  stagesForTrack,
  stageLabel,
  isRevenueTrack,
  trackFromParam,
  OPEN_PIPELINE_STAGES,
} from "@/lib/lead-tracks";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Leads" };

// Prisma only accepts the { sort, nulls } object form on nullable columns —
// non-nullable ones must use a plain "asc"/"desc".
const SORTABLE: Record<
  SortKey,
  { field: keyof Prisma.LeadOrderByWithRelationInput; nullable: boolean }
> = {
  title: { field: "title", nullable: false },
  stage: { field: "stage", nullable: false },
  mrr: { field: "estMrr", nullable: true },
  value: { field: "estValue", nullable: true },
  close: { field: "expectedClose", nullable: true },
  created: { field: "createdAt", nullable: false },
};

function leadOrderBy(
  key: SortKey,
  dir: "asc" | "desc"
): Prisma.LeadOrderByWithRelationInput {
  const { field, nullable } = SORTABLE[key];
  return {
    [field]: nullable ? { sort: dir, nulls: "last" } : dir,
  } as Prisma.LeadOrderByWithRelationInput;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    owner?: string;
    view?: string;
    stage?: string;
    sort?: string;
    dir?: string;
    track?: string;
  }>;
}) {
  const { q, owner, view, stage, sort, dir, track } = await searchParams;
  const search = q?.trim();
  const isList = view === "list";
  // The two tracks have different stages and different economics, so the
  // board shows one at a time. Projects first — it's the revenue view.
  const currentTrack = trackFromParam(track);
  const trackParam = currentTrack === "NEW_COMPANY" ? "NEW_COMPANY" : undefined;
  const STAGES = stagesForTrack(currentTrack);
  const showMoney = isRevenueTrack(currentTrack);
  const validStage = (STAGES as string[]).includes(stage ?? "")
    ? stage
    : undefined;
  const sortKey: SortKey = (
    Object.keys(SORTABLE) as SortKey[]
  ).includes(sort as SortKey)
    ? (sort as SortKey)
    : "created";
  // MRR and total value are all-null on the organization track, so sorting by
  // them would be meaningless there.
  const sortDir: "asc" | "desc" = dir === "asc" ? "asc" : "desc";
  const effectiveSort: SortKey =
    !showMoney && (sortKey === "mrr" || sortKey === "value")
      ? "created"
      : sortKey;

  const where: Prisma.LeadWhereInput = {
    type: currentTrack,
    ...(owner ? { ownerId: owner } : {}),
    // Stage filtering only applies to the list; the board shows all stages
    // as columns.
    ...(isList && validStage
      ? { stage: validStage as Prisma.EnumLeadStageFilter["equals"] }
      : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { source: { contains: search, mode: "insensitive" } },
            { company: { name: { contains: search, mode: "insensitive" } } },
            {
              contact: {
                OR: [
                  { firstName: { contains: search, mode: "insensitive" } },
                  { lastName: { contains: search, mode: "insensitive" } },
                ],
              },
            },
          ],
        }
      : {}),
  };

  const [leads, companies, contacts, owners, trackCounts] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: isList
        ? leadOrderBy(effectiveSort, sortDir)
        : { createdAt: "desc" },
      include: {
        company: { select: { name: true } },
        contact: { select: { firstName: true, lastName: true } },
        owner: { select: { name: true } },
      },
    }),
    prisma.company.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.contact.findMany({
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true, companyId: true },
    }),
    prisma.user.findMany({
      where: { isActive: true, ownedLeads: { some: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Track pill counts. Scoped by owner but deliberately not by search or
    // stage, so switching tracks mid-search can't show a count that
    // contradicts what the destination actually renders.
    prisma.lead.groupBy({
      by: ["type"],
      where: {
        ...(owner ? { ownerId: owner } : {}),
        stage: { notIn: ["WON", "LOST"] },
      },
      _count: true,
    }),
  ]);

  const openByTrack = {
    NEW_PROJECT:
      trackCounts.find((t) => t.type === "NEW_PROJECT")?._count ?? 0,
    NEW_COMPANY:
      trackCounts.find((t) => t.type === "NEW_COMPANY")?._count ?? 0,
  };

  const kanbanLeads: KanbanLead[] = leads.map((l) => ({
    id: l.id,
    title: l.title,
    type: l.type,
    stage: l.stage,
    estMrr: l.estMrr ? Number(l.estMrr) : null,
    estValue: l.estValue ? Number(l.estValue) : null,
    companyName: l.company?.name ?? null,
    contactName: l.contact ? fullName(l.contact) : null,
    ownerName: l.owner?.name ?? null,
  }));

  const tableLeads: LeadRow[] = leads.map((l) => ({
    id: l.id,
    title: l.title,
    type: l.type,
    stage: l.stage,
    estMrr: l.estMrr ? Number(l.estMrr) : null,
    estMonths: l.estMonths,
    estValue: l.estValue ? Number(l.estValue) : null,
    companyName: l.company?.name ?? null,
    contactName: l.contact ? fullName(l.contact) : null,
    ownerName: l.owner?.name ?? null,
    source: l.source,
    expectedClose: l.expectedClose,
    createdAt: l.createdAt,
  }));

  // Forecast only. This used to sum every lead including WON and LOST, which
  // is why it grew without bound and disagreed with the dashboard tile.
  const forecast = tableLeads.filter((l) =>
    OPEN_PIPELINE_STAGES.includes(l.stage)
  );
  const totalMrr = forecast.reduce((sum, l) => sum + (l.estMrr ?? 0), 0);
  const totalValue = forecast.reduce((sum, l) => sum + (l.estValue ?? 0), 0);
  const unqualifiedCount = tableLeads.filter(
    (l) => l.stage === "UNQUALIFIED"
  ).length;
  const approvedCount = tableLeads.filter((l) => l.stage === "WON").length;

  // Preserve current params when building links.
  function buildHref(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = {
      q: search,
      owner,
      track: trackParam,
      view: isList ? "list" : undefined,
      stage: validStage,
      sort: effectiveSort === "created" ? undefined : effectiveSort,
      dir: sortDir === "desc" ? undefined : sortDir,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `/leads?${qs}` : "/leads";
  }

  const viewToggle = [
    { key: "board", label: "Board", href: buildHref({ view: undefined }) },
    { key: "list", label: "List", href: buildHref({ view: "list" }) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          {/* No dollar figure on the organization track — enforced by the
              branch, not by hoping the data is null. */}
          <p className="text-muted-foreground">
            {showMoney ? (
              <>
                {leads.length} project lead{leads.length === 1 ? "" : "s"} ·{" "}
                {formatCurrency(totalMrr)}/mo forecast ({forecast.length}{" "}
                qualified) · {formatCurrency(totalValue)} total value ·{" "}
                {unqualifiedCount} unqualified
              </>
            ) : (
              <>
                {leads.length} organization
                {leads.length === 1 ? "" : "s"} · {forecast.length} in active
                conversation · {approvedCount} approved vendor
                {approvedCount === 1 ? "" : "s"} · {unqualifiedCount}{" "}
                unqualified
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput placeholder="Search leads..." />
          <div className="flex rounded-lg border bg-card p-1">
            {viewToggle.map((t) => (
              <Link
                key={t.key}
                href={t.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  (t.key === "list") === isList
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </Link>
            ))}
          </div>
          {owners.length > 1 && (
            <FilterPills
              basePath="/leads"
              param="owner"
              current={owner}
              keepParams={{
                q: search,
                track: trackParam,
                view: isList ? "list" : undefined,
                stage: validStage,
              }}
              options={owners.map((u) => ({ value: u.id, label: u.name }))}
            />
          )}
          <LeadFormDialog
            companies={companies}
            contacts={contacts.map((c) => ({
              id: c.id,
              name: fullName(c),
              companyId: c.companyId,
            }))}
            users={owners}
          />
        </div>
      </div>

      {/* The tracks have different stages and different economics, so the
          board shows one at a time. Counts keep the other one in view rather
          than hiding it. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Track
        </span>
        <FilterPills
          basePath="/leads"
          param="track"
          current={currentTrack}
          includeAll={false}
          // Stage and money sorts don't survive a track change — a
          // project-only stage or an all-null sort column would render empty.
          keepParams={{ q: search, owner, view: isList ? "list" : undefined }}
          options={[
            {
              value: "NEW_PROJECT",
              label: "Projects",
              count: openByTrack.NEW_PROJECT,
            },
            {
              value: "NEW_COMPANY",
              label: "Organizations",
              count: openByTrack.NEW_COMPANY,
            },
          ]}
        />
      </div>

      {isList && (
        <FilterPills
          basePath="/leads"
          param="stage"
          current={validStage}
          keepParams={{
            q: search,
            owner,
            track: trackParam,
            view: "list",
            sort: effectiveSort === "created" ? undefined : effectiveSort,
            dir: sortDir === "desc" ? undefined : sortDir,
          }}
          options={STAGES.map((s) => ({
            value: s,
            label: stageLabel(currentTrack, s).toLowerCase(),
          }))}
        />
      )}

      {isList ? (
        <Card>
          <CardContent className="p-0">
            <LeadsTable
              leads={tableLeads}
              track={currentTrack}
              sort={effectiveSort}
              dir={sortDir}
              hrefFor={(key) =>
                buildHref({
                  sort: key,
                  // Clicking the active column flips direction.
                  dir:
                    effectiveSort === key && sortDir === "desc"
                      ? "asc"
                      : "desc",
                })
              }
            />
          </CardContent>
        </Card>
      ) : (
        <LeadsKanban leads={kanbanLeads} track={currentTrack} />
      )}
    </div>
  );
}
