import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Chatter } from "@/components/chatter/chatter";
import { LeadStageSelect } from "@/components/leads/lead-stage-select";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true } },
      contact: true,
      project: { select: { id: true, name: true, status: true } },
      owner: { select: { name: true } },
      quotes: { orderBy: { createdAt: "desc" } },
      messages: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true } } },
      },
    },
  });
  if (!lead) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{lead.title}</h1>
            <Badge variant="outline" className="gap-1">
              {lead.type === "NEW_COMPANY" ? (
                <Building2 className="h-3 w-3" />
              ) : (
                <HardHat className="h-3 w-3" />
              )}
              {lead.type === "NEW_COMPANY" ? "New company" : "New project"}
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
        <LeadStageSelect leadId={lead.id} stage={lead.stage} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Est. value</dt>
                  <dd className="font-medium">
                    {formatCurrency(lead.estValue ? Number(lead.estValue) : null)}
                  </dd>
                </div>
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
                  <dd className="font-medium">{lead.owner?.name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="font-medium">{formatDate(lead.createdAt)}</dd>
                </div>
                {lead.project && (
                  <div>
                    <dt className="text-muted-foreground">Project</dt>
                    <dd className="font-medium">
                      <Link
                        href={`/projects/${lead.project.id}`}
                        className="hover:underline"
                      >
                        {lead.project.name}
                      </Link>
                    </dd>
                  </div>
                )}
                {lead.stage === "LOST" && lead.lostReason && (
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">Lost reason</dt>
                    <dd className="font-medium">{lead.lostReason}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

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
                      <Badge variant="secondary">{q.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
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
