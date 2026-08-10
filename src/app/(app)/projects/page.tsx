import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { statusBadgeVariant } from "@/lib/badges";
import { FilterPills } from "@/components/layout/filter-pills";

export const metadata = { title: "Projects" };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const validStatus = ["UPCOMING", "ACTIVE", "COMPLETED"].includes(status ?? "")
    ? (status as "UPCOMING" | "ACTIVE" | "COMPLETED")
    : undefined;

  const [projects, companies] = await Promise.all([
    prisma.project.findMany({
      where: validStatus ? { status: validStatus } : undefined,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        company: { select: { id: true, name: true } },
        _count: { select: { subscriptions: true } },
      },
    }),
    prisma.company.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">
            Construction projects & temporary jobs your trailers serve
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FilterPills
            basePath="/projects"
            param="status"
            current={validStatus}
            options={[
              { value: "UPCOMING", label: "Upcoming" },
              { value: "ACTIVE", label: "Active" },
              { value: "COMPLETED", label: "Completed" },
            ]}
          />
          <ProjectFormDialog companies={companies} />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Timeline</TableHead>
                <TableHead className="text-center">Subscriptions</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No projects yet.
                  </TableCell>
                </TableRow>
              )}
              {projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link
                      href={`/projects/${p.id}`}
                      className="font-medium hover:underline"
                    >
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/companies/${p.company.id}`}
                      className="hover:underline"
                    >
                      {p.company.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {[p.siteCity, p.siteState].filter(Boolean).join(", ") ||
                      "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.expectedStart
                      ? `${formatDate(p.expectedStart)} → ${formatDate(
                          p.expectedEnd
                        )}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    {p._count.subscriptions}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(p.status)}>
                      {p.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
