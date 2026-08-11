import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Chatter } from "@/components/chatter/chatter";
import { ActivitiesCard } from "@/components/activities/activities-card";
import { LeadStageSelect } from "@/components/leads/lead-stage-select";
import {
  LeadFormDialog,
  type LeadFormData,
} from "@/components/leads/lead-form-dialog";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { statusBadgeVariant } from "@/lib/badges";
import { stageLabel } from "@/lib/lead-tracks";
import { formatCurrency, formatDate, fullName } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Building2, HardHat, Plus } from "lucide-react";

export const metadata = { title: "Lead" };

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [lead, companies, allContacts, users] = await Promise.all([
    prisma.lead.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
        contact: true,
        project: {
          select: {
            id: true,
            name: true,
            status: true,
            companyId: true,
            siteStreet: true,
            siteCity: true,
            siteState: true,
            siteZip: true,
            expectedStart: true,
            expectedEnd: true,
            notes: true,
          },
        },
        owner: { select: { id: true, name: true } },
        quotes: { orderBy: { createdAt: "desc" } },
        // Provenance, both directions: where a project lead came from, and
        // what an organization lead has produced.
        sourceLead: { select: { id: true, title: true } },
        spawnedLeads: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            title: true,
            stage: true,
            estMrr: true,
            createdAt: true,
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          include: { author: { select: { name: true } } },
        },
      },
    }),
    prisma.company.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.contact.findMany({
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true, companyId: true },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!lead) notFound();

  const contactsList = allContacts.map((c) => ({
    id: c.id,
    name: `${c.firstName} ${c.lastName}`,
    companyId: c.companyId,
  }));

  const leadFormData: LeadFormData = {
    id: lead.id,
    title: lead.title,
    type: lead.type,
    companyId: lead.companyId,
    contactId: lead.contactId,
    ownerId: lead.owner?.id ?? null,
    estMrr: lead.estMrr ? Number(lead.estMrr) : null,
    estMonths: lead.estMonths,
    estValue: lead.estValue ? Number(lead.estValue) : null,
    source: lead.source,
    expectedClose: lead.expectedClose,
  };

  const isOrganizationLead = lead.type === "NEW_COMPANY";
  const siteAddress =
    [
      lead.project?.siteStreet,
      [lead.project?.siteCity, lead.project?.siteState]
        .filter(Boolean)
        .join(", "),
      lead.project?.siteZip,
    ]
      .filter(Boolean)
      .join(" · ") || null;
  const canSpawnProject =
    isOrganizationLead &&
    !!lead.companyId &&
    (lead.stage === "WON" || lead.stage === "QUALIFIED");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{lead.title}</h1>
            <Badge variant="outline" className="gap-1">
              {isOrganizationLead ? (
                <Building2 className="h-3 w-3" />
              ) : (
                <HardHat className="h-3 w-3" />
              )}
              {isOrganizationLead ? "Organization" : "Project"}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {lead.company ? (
              <Link
                href={`/companies/${lead.company.id}`}
                className="hover:underline"
              >
                {lead.company.name}
              </Link>
            ) : (
              "No company linked"
            )}
            {lead.contact && ` · ${fullName(lead.contact)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Prospecting produces jobs — that's the point of the track. The
              affordance appears once the relationship is real, not only after
              formal vendor approval. */}
          {canSpawnProject && (
            <LeadFormDialog
              companies={companies}
              contacts={contactsList}
              users={users}
              presetType="NEW_PROJECT"
              presetCompanyId={lead.companyId ?? undefined}
              sourceLeadId={lead.id}
              triggerLabel="New project lead"
            />
          )}
          <LeadFormDialog
            companies={companies}
            contacts={contactsList}
            users={users}
            lead={leadFormData}
          />
          <LeadStageSelect
            leadId={lead.id}
            stage={lead.stage}
            type={lead.type}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Details</CardTitle>
              {/* Site and schedule live on the job record. Setting the end date
                  here is what puts the pickup on Dispatch's radar later. */}
              {lead.project && (
                <ProjectFormDialog
                  project={lead.project}
                  companies={[]}
                  fixedCompanyId={lead.project.companyId}
                  triggerLabel="Site & schedule"
                  title="Site & schedule"
                  hideName
                />
              )}
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                {/* Organization leads carry no economics — the job that earns
                    the revenue is a separate project lead. */}
                {!isOrganizationLead && (
                  <>
                    <div>
                      <dt className="text-muted-foreground">Est. MRR</dt>
                      <dd className="font-medium">
                        {lead.estMrr
                          ? `${formatCurrency(Number(lead.estMrr))}/mo`
                          : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Est. length</dt>
                      <dd className="font-medium">
                        {lead.estMonths ? `${lead.estMonths} months` : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Total value</dt>
                      <dd className="font-medium">
                        {formatCurrency(
                          lead.estValue ? Number(lead.estValue) : null
                        )}
                      </dd>
                    </div>
                  </>
                )}
                <div>
                  <dt className="text-muted-foreground">Source</dt>
                  <dd className="font-medium">{lead.source ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Expected close</dt>
                  <dd className="font-medium">
                    {formatDate(lead.expectedClose)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Owner</dt>
                  <dd className="font-medium">{lead.owner?.name ?? "Unassigned"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="font-medium">{formatDate(lead.createdAt)}</dd>
                </div>
                {lead.project && (
                  <>
                    <div>
                      <dt className="text-muted-foreground">Job</dt>
                      <dd className="font-medium">{lead.project.name}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Site</dt>
                      <dd className="font-medium">{siteAddress ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Job runs</dt>
                      <dd className="font-medium">
                        {lead.project.expectedStart || lead.project.expectedEnd
                          ? `${formatDate(lead.project.expectedStart) || "?"} → ${
                              formatDate(lead.project.expectedEnd) || "?"
                            }`
                          : "—"}
                      </dd>
                    </div>
                  </>
                )}
                {lead.sourceLead && (
                  <div>
                    <dt className="text-muted-foreground">Sourced from</dt>
                    <dd className="font-medium">
                      <Link
                        href={`/leads/${lead.sourceLead.id}`}
                        className="hover:underline"
                      >
                        {lead.sourceLead.title}
                      </Link>
                    </dd>
                  </div>
                )}
                {lead.stage === "LOST" && lead.lostReason && (
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">
                      {isOrganizationLead ? "Reason" : "Lost reason"}
                    </dt>
                    <dd className="font-medium">{lead.lostReason}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          {/* Quoting an organization is a category error — you quote a job.
              The relationship track shows what it produced instead. */}
          {isOrganizationLead ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Project leads sourced ({lead.spawnedLeads.length})
                </CardTitle>
                <CardDescription>
                  Revenue this relationship produced. The forecast lives on
                  these leads, not on the relationship itself.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {lead.spawnedLeads.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    None yet. Use “New project lead” when a job surfaces.
                  </p>
                ) : (
                  <div className="divide-y">
                    {lead.spawnedLeads.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <Link
                          href={`/leads/${s.id}`}
                          className="truncate text-sm font-medium hover:underline"
                        >
                          {s.title}
                        </Link>
                        <div className="flex shrink-0 items-center gap-2">
                          {s.estMrr && (
                            <span className="text-xs text-muted-foreground">
                              {formatCurrency(Number(s.estMrr))}/mo
                            </span>
                          )}
                          <Badge variant={statusBadgeVariant(s.stage)}>
                            {stageLabel("NEW_PROJECT", s.stage)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Quotes</CardTitle>
                {lead.companyId && (
                  <Button asChild size="sm" variant="outline" className="gap-1">
                    <Link href={`/quotes/new?leadId=${lead.id}`}>
                      <Plus className="h-3.5 w-3.5" /> Create quote
                    </Link>
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {lead.quotes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No quotes yet.
                  </p>
                ) : (
                  <div className="divide-y">
                    {lead.quotes.map((q) => (
                      <div
                        key={q.id}
                        className="flex items-center justify-between py-2"
                      >
                        <Link
                          href={`/quotes/${q.id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {q.number}
                        </Link>
                        <Badge variant={statusBadgeVariant(q.status)}>
                          {q.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <ActivitiesCard
            parent={{ leadId: lead.id }}
            revalidate={`/leads/${lead.id}`}
          />
          <Chatter
            messages={lead.messages}
            parent={{ leadId: lead.id }}
            revalidate={`/leads/${lead.id}`}
          />
        </div>
      </div>
    </div>
  );
}
