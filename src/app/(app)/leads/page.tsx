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
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Leads" };

const SORTABLE: Record<SortKey, keyof Prisma.LeadOrderByWithRelationInput> = {
  title: "title",
  stage: "stage",
  mrr: "estMrr",
  value: "estValue",
  close: "expectedClose",
  created: "createdAt",
};

const STAGES = ["NEW", "CONTACTED", "QUALIFIED", "QUOTE_SENT", "WON", "LOST"];

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
  }>;
}) {
  const { q, owner, view, stage, sort, dir } = await searchParams;
  const search = q?.trim();
  const isList = view === "list";
  const validStage = STAGES.includes(stage ?? "") ? stage : undefined;
  const sortKey: SortKey = (
    Object.keys(SORTABLE) as SortKey[]
  ).includes(sort as SortKey)
    ? (sort as SortKey)
    : "created";
  const sortDir: "asc" | "desc" = dir === "asc" ? "asc" : "desc";

  const where: Prisma.LeadWhereInput = {
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

  const [leads, companies, contacts, owners] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: isList
        ? { [SORTABLE[sortKey]]: { sort: sortDir, nulls: "last" } }
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
  ]);

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
    expectedClose: l.expectedClose,
    createdAt: l.createdAt,
  }));

  const totalMrr = tableLeads.reduce((sum, l) => sum + (l.estMrr ?? 0), 0);
  const totalValue = tableLeads.reduce((sum, l) => sum + (l.estValue ?? 0), 0);

  // Preserve current params when building links.
  function buildHref(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = {
      q: search,
      owner,
      view: isList ? "list" : undefined,
      stage: validStage,
      sort: sortKey === "created" ? undefined : sortKey,
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
          <p className="text-muted-foreground">
            {leads.length} lead{leads.length === 1 ? "" : "s"} ·{" "}
            {formatCurrency(totalMrr)}/mo pipeline MRR ·{" "}
            {formatCurrency(totalValue)} total value
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
          />
        </div>
      </div>

      {isList && (
        <FilterPills
          basePath="/leads"
          param="stage"
          current={validStage}
          keepParams={{
            q: search,
            owner,
            view: "list",
            sort: sortKey === "created" ? undefined : sortKey,
            dir: sortDir === "desc" ? undefined : sortDir,
          }}
          options={STAGES.map((s) => ({
            value: s,
            label: s.replace("_", " ").toLowerCase(),
          }))}
        />
      )}

      {isList ? (
        <Card>
          <CardContent className="p-0">
            <LeadsTable
              leads={tableLeads}
              sort={sortKey}
              dir={sortDir}
              hrefFor={(key) =>
                buildHref({
                  sort: key,
                  // Clicking the active column flips direction.
                  dir:
                    sortKey === key && sortDir === "desc" ? "asc" : "desc",
                })
              }
            />
          </CardContent>
        </Card>
      ) : (
        <LeadsKanban leads={kanbanLeads} />
      )}
    </div>
  );
}
