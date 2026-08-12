import Link from "next/link";
import { Fragment } from "react";
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

const GROUPS = ["none", "site", "customer"] as const;
type GroupBy = (typeof GROUPS)[number];

/** Sorts last regardless of alphabet — units with no job aren't a "site". */
const YARD_KEY = "￿__yard";

export default async function FleetPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; group?: string }>;
}) {
  const { status, q, group } = await searchParams;
  const search = q?.trim();
  const groupBy: GroupBy = GROUPS.includes(group as GroupBy)
    ? (group as GroupBy)
    : "none";
  const validStatus = ["AVAILABLE", "DEPLOYED", "MAINTENANCE", "RETIRED"].includes(
    status ?? ""
  )
    ? (status as "AVAILABLE" | "DEPLOYED" | "MAINTENANCE" | "RETIRED")
    : undefined;

  // Only the open deployment tells us where a unit is now.
  const onSiteNow = { returnedAt: null };

  const trailers = await prisma.trailer.findMany({
    where: {
      ...(validStatus ? { status: validStatus } : {}),
      ...(search
        ? {
            OR: [
              { unitNumber: { contains: search, mode: "insensitive" } },
              { model: { contains: search, mode: "insensitive" } },
              { notes: { contains: search, mode: "insensitive" } },
              /* "Where are my units?" is the question this page exists to
                 answer, so search reaches through the current deployment to the
                 job, its city, and the customer — not just the unit's own
                 fields. */
              {
                deployments: {
                  some: {
                    ...onSiteNow,
                    subscription: {
                      project: {
                        OR: [
                          { name: { contains: search, mode: "insensitive" } },
                          { siteCity: { contains: search, mode: "insensitive" } },
                          { siteState: { contains: search, mode: "insensitive" } },
                        ],
                      },
                    },
                  },
                },
              },
              {
                deployments: {
                  some: {
                    ...onSiteNow,
                    subscription: {
                      company: {
                        name: { contains: search, mode: "insensitive" },
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: { unitNumber: "asc" },
    include: {
      deployments: {
        where: onSiteNow,
        include: {
          subscription: {
            include: {
              company: { select: { name: true } },
              project: {
                select: {
                  id: true,
                  name: true,
                  siteCity: true,
                  siteState: true,
                },
              },
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

  type Row = (typeof trailers)[number];
  const cityOf = (r: Row) => {
    const p = r.deployments[0]?.subscription.project;
    return [p?.siteCity, p?.siteState].filter(Boolean).join(", ") || null;
  };

  /* Group in memory rather than with a second query — the fleet is a few
     hundred rows and this keeps one source of truth for the filters. */
  const grouped: { key: string; label: string; sub: string | null; rows: Row[] }[] =
    [];
  if (groupBy !== "none") {
    const map = new Map<string, { label: string; sub: string | null; rows: Row[] }>();
    for (const t of trailers) {
      const d = t.deployments[0];
      let key: string;
      let label: string;
      let sub: string | null = null;
      if (!d) {
        key = YARD_KEY;
        label = "Not deployed";
        sub = "available, in maintenance, or retired";
      } else if (groupBy === "site") {
        key = d.subscription.project?.id ?? `${YARD_KEY}-nojob`;
        label = d.subscription.project?.name ?? "Deployed, no job linked";
        sub = cityOf(t);
      } else {
        key = d.subscription.company.name;
        label = d.subscription.company.name;
      }
      const existing = map.get(key);
      if (existing) existing.rows.push(t);
      else map.set(key, { label, sub, rows: [t] });
    }
    grouped.push(
      ...[...map.entries()]
        .map(([key, v]) => ({ key, ...v }))
        // Yard/unlinked buckets sort last via the sentinel key.
        .sort((a, b) =>
          a.key.startsWith(YARD_KEY) || b.key.startsWith(YARD_KEY)
            ? a.key.localeCompare(b.key)
            : a.label.localeCompare(b.label)
        )
    );
  }

  const keep = { q: search, status: validStatus };

  function row(t: Row) {
    const deployment = t.deployments[0];
    const city = cityOf(t);
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
          <Badge variant={statusBadgeVariant(t.status)}>{t.status}</Badge>
        </TableCell>
        <TableCell>
          {/* Plain text: a fleet-only user has no Accounting area, so linking
              through to the job would dead-end. */}
          {deployment?.subscription.project?.name ? (
            <>
              {deployment.subscription.project.name}
              {city && (
                <span className="block text-xs text-muted-foreground">
                  {city}
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="text-muted-foreground">
          {deployment?.subscription.company.name ?? "—"}
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fleet</h1>
          <p className="text-muted-foreground">
            {counts.total} unit{counts.total === 1 ? "" : "s"}
            {search && " matching"} · search by unit, model, job, city, or
            customer
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput placeholder="Unit, job, city, customer..." />
          <FilterPills
            basePath="/fleet"
            param="status"
            current={validStatus}
            keepParams={{ q: search, group: groupBy === "none" ? undefined : groupBy }}
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

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Group by
        </span>
        <FilterPills
          basePath="/fleet"
          param="group"
          current={groupBy}
          includeAll={false}
          keepParams={keep}
          options={[
            { value: "none", label: "Flat" },
            { value: "site", label: "Site" },
            { value: "customer", label: "Customer" },
          ]}
        />
        {groupBy !== "none" && (
          <span className="text-xs text-muted-foreground">
            {grouped.filter((g) => !g.key.startsWith(YARD_KEY)).length}{" "}
            {groupBy === "site" ? "active site" : "customer"}
            {grouped.filter((g) => !g.key.startsWith(YARD_KEY)).length === 1
              ? ""
              : "s"}
          </span>
        )}
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
                    {search
                      ? `Nothing matches "${search}".`
                      : "No trailers yet. Add your first unit."}
                  </TableCell>
                </TableRow>
              )}

              {groupBy === "none"
                ? trailers.map(row)
                : grouped.map((g) => (
                    <Fragment key={g.key}>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableCell colSpan={5} className="py-2">
                          <span className="text-sm font-semibold">
                            {g.label}
                          </span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {g.rows.length} unit
                            {g.rows.length === 1 ? "" : "s"}
                            {g.sub && ` · ${g.sub}`}
                          </span>
                        </TableCell>
                      </TableRow>
                      {g.rows.map(row)}
                    </Fragment>
                  ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
