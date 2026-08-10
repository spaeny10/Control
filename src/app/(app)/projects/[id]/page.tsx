import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { Chatter } from "@/components/chatter/chatter";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { statusBadgeVariant } from "@/lib/badges";

export const metadata = { title: "Project" };

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true } },
      leads: { orderBy: { createdAt: "desc" } },
      subscriptions: {
        orderBy: { createdAt: "desc" },
        include: {
          deployments: {
            where: { returnedAt: null },
            include: { trailer: { select: { unitNumber: true } } },
          },
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true } } },
      },
    },
  });
  if (!project) notFound();

  const site = [
    project.siteStreet,
    [project.siteCity, project.siteState, project.siteZip]
      .filter(Boolean)
      .join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {project.name}
            </h1>
            <Badge variant={statusBadgeVariant(project.status)}>
              {project.status}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            <Link
              href={`/companies/${project.company.id}`}
              className="hover:underline"
            >
              {project.company.name}
            </Link>
            {site && ` · ${site}`}
          </p>
          {project.expectedStart && (
            <p className="text-sm text-muted-foreground">
              {formatDate(project.expectedStart)} →{" "}
              {formatDate(project.expectedEnd)}
            </p>
          )}
        </div>
        <ProjectFormDialog project={project} companies={[]} fixedCompanyId={project.companyId} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Subscriptions</CardTitle>
            </CardHeader>
            <CardContent>
              {project.subscriptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No subscriptions on this project yet.
                </p>
              ) : (
                <div className="divide-y">
                  {project.subscriptions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between py-2"
                    >
                      <div>
                        <Link
                          href={`/subscriptions/${s.id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          Subscription · started {formatDate(s.startDate)}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {s.deployments.length > 0
                            ? `Units on site: ${s.deployments
                                .map((d) => d.trailer.unitNumber)
                                .join(", ")}`
                            : "No trailers deployed"}
                        </p>
                      </div>
                      <Badge variant={statusBadgeVariant(s.status)}>
                        {s.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {project.leads.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Leads</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {project.leads.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center justify-between py-2"
                    >
                      <Link
                        href={`/leads/${l.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {l.title}
                      </Link>
                      <Badge variant={statusBadgeVariant(l.stage)}>
                        {l.stage.replace("_", " ")}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div>
          <Chatter
            messages={project.messages}
            parent={{ projectId: project.id }}
            revalidate={`/projects/${project.id}`}
          />
        </div>
      </div>
    </div>
  );
}
