import { prisma } from "@/lib/prisma";
import { LeadFormDialog } from "@/components/leads/lead-form-dialog";
import { LeadsKanban, type KanbanLead } from "@/components/leads/leads-kanban";
import { fullName } from "@/lib/format";
import { SearchInput } from "@/components/layout/search-input";
import { FilterPills } from "@/components/layout/filter-pills";

export const metadata = { title: "Leads" };

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; owner?: string }>;
}) {
  const { q, owner } = await searchParams;
  const search = q?.trim();

  const [leads, companies, contacts, owners] = await Promise.all([
    prisma.lead.findMany({
      where: {
        ...(owner ? { ownerId: owner } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { source: { contains: search, mode: "insensitive" } },
                {
                  company: {
                    name: { contains: search, mode: "insensitive" },
                  },
                },
                {
                  contact: {
                    OR: [
                      {
                        firstName: { contains: search, mode: "insensitive" },
                      },
                      { lastName: { contains: search, mode: "insensitive" } },
                    ],
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
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
      select: {
        id: true,
        firstName: true,
        lastName: true,
        companyId: true,
      },
    }),
    prisma.user.findMany({
      where: { isActive: true, ownedLeads: { some: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  // Serialize for the client kanban (Decimal -> number).
  const kanbanLeads: KanbanLead[] = leads.map((l) => ({
    id: l.id,
    title: l.title,
    type: l.type,
    stage: l.stage,
    estValue: l.estValue ? Number(l.estValue) : null,
    companyName: l.company?.name ?? null,
    contactName: l.contact ? fullName(l.contact) : null,
    ownerName: l.owner?.name ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
          <p className="text-muted-foreground">
            Drag cards between stages to update the pipeline
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput placeholder="Search leads..." />
          {owners.length > 1 && (
            <FilterPills
              basePath="/leads"
              param="owner"
              current={owner}
              keepParams={{ q: search }}
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

      <LeadsKanban leads={kanbanLeads} />
    </div>
  );
}
