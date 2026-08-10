import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TrailerFormDialog } from "@/components/fleet/trailer-form-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant } from "@/lib/badges";
import { FilterPills } from "@/components/layout/filter-pills";
import { SearchInput } from "@/components/layout/search-input";

export const metadata = { title: "Fleet" };

export default async function FleetPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status, q } = await searchParams;
  const search = q?.trim();
  const validStatus = ["AVAILABLE", "DEPLOYED", "MAINTENANCE", "RETIRED"].includes(
    status ?? ""
  )
    ? (status as "AVAILABLE" | "DEPLOYED" | "MAINTENANCE" | "RETIRED")
    : undefined;

  const trailers = await prisma.trailer.findMany({
    where: {
      ...(validStatus ? { status: validStatus } : {}),
      ...(search
        ? {
            OR: [
              { unitNumber: { contains: search, mode: "insensitive" } },
              { model: { contains: search, mode: "insensitive" } },
              { notes: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { unitNumber: "asc" },
    include: {
      deployments: {
        where: { returnedAt: null },
        include: {
          subscription: {
            include: {
              company: { select: { name: true } },
              project: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  const counts = {
    total: trailers.length,
    available: trailers.filter((t) => t.status === "AVAILABLE").length,
    deployed: trailers.filter((t) => t.status === "DEPLOYED").length,
    maintenance: trailers.filter((t) => t.status === "MAINTENANCE").length,
  };
  const activeFleet = counts.total
    ? trailers.filter((t) => t.status !== "RETIRED").length
    : 0;
  const utilization = activeFleet
    ? Math.round((counts.deployed / activeFleet) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fleet</h1>
          <p className="text-muted-foreground">
            BIGVIEW trailer units and where they are
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput placeholder="Search units..." />
          <FilterPills
            basePath="/fleet"
            param="status"
            current={validStatus}
            keepParams={{ q: search }}
            options={[
              { value: "AVAILABLE", label: "Available" },
              { value: "DEPLOYED", label: "Deployed" },
              { value: "MAINTENANCE", label: "Maintenance" },
              { value: "RETIRED", label: "Retired" },
            ]}
          />
          <TrailerFormDialog />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total units", value: counts.total },
          { label: "Available", value: counts.available },
          { label: "Deployed", value: counts.deployed },
          { label: "Utilization", value: `${utilization}%` },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unit</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Current site</TableHead>
                <TableHead>Customer</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trailers.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No trailers yet. Add your first unit.
                  </TableCell>
                </TableRow>
              )}
              {trailers.map((t) => {
                const deployment = t.deployments[0];
                return (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Link
                        href={`/fleet/${t.id}`}
                        className="font-medium hover:underline"
                      >
                        {t.unitNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.model ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(t.status)}>
                        {t.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {deployment?.subscription.project ? (
                        <Link
                          href={`/projects/${deployment.subscription.project.id}`}
                          className="hover:underline"
                        >
                          {deployment.subscription.project.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {deployment?.subscription.company.name ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
