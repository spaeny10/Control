import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TrailerFormDialog } from "@/components/fleet/trailer-form-dialog";
import { TrailerStatusSelect } from "@/components/fleet/trailer-status-select";
import { MaintenanceLogDialog } from "@/components/fleet/maintenance-log-dialog";
import { ReturnTrailerButton } from "@/components/fleet/return-trailer-button";
import { Chatter } from "@/components/chatter/chatter";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import { statusBadgeVariant } from "@/lib/badges";
import { MapPin } from "lucide-react";

export const metadata = { title: "Trailer" };

export default async function TrailerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trailer = await prisma.trailer.findUnique({
    where: { id },
    include: {
      deployments: {
        orderBy: { deployedAt: "desc" },
        include: {
          subscription: {
            include: {
              company: { select: { id: true, name: true } },
              project: {
                select: {
                  id: true,
                  name: true,
                  siteStreet: true,
                  siteCity: true,
                  siteState: true,
                  siteZip: true,
                },
              },
              // Who to call from the yard if the unit isn't where we think.
              siteContact: {
                select: { firstName: true, lastName: true, phone: true },
              },
              deployments: { select: { id: true, returnedAt: true } },
            },
          },
        },
      },
      maintenanceLogs: { orderBy: { date: "desc" } },
      messages: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true } } },
      },
    },
  });
  if (!trailer) notFound();

  const currentDeployment = trailer.deployments.find((d) => !d.returnedAt);

  /* The jobsite address, assembled from whatever's on file. Most existing jobs
     predate the address being required at conversion, so city/state is common
     and street is not — worth showing what we have while being clear it isn't
     navigable. */
  const site = currentDeployment?.subscription.project;
  const siteStreetKnown = !!site?.siteStreet;
  const siteAddress =
    [
      site?.siteStreet,
      [site?.siteCity, site?.siteState].filter(Boolean).join(", "),
      site?.siteZip,
    ]
      .filter(Boolean)
      .join(" · ") || null;
  // Only offer directions when there's a street to route to.
  const mapsHref =
    siteStreetKnown && siteAddress
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          [site?.siteStreet, site?.siteCity, site?.siteState, site?.siteZip]
            .filter(Boolean)
            .join(", ")
        )}`
      : null;
  const totalMaintenanceCost = trailer.maintenanceLogs.reduce(
    (sum, log) => sum + (log.cost ? Number(log.cost) : 0),
    0
  );

  // Unit economics: revenue attributed to this unit is estimated by splitting
  // each subscription's normalized monthly value evenly across its units for
  // the days this unit was on site.
  const now = new Date();
  let deployedDays = 0;
  let revenueEstimate = 0;
  for (const d of trailer.deployments) {
    const end = d.returnedAt ?? now;
    const days = Math.max(
      0,
      (end.getTime() - d.deployedAt.getTime()) / 86_400_000
    );
    deployedDays += days;
    const siblingDeployments = d.subscription.deployments;
    const openUnits = siblingDeployments.filter((x) => !x.returnedAt).length;
    const unitCount = Math.max(1, openUnits || siblingDeployments.length);
    revenueEstimate += (days / 30.44) * (Number(d.subscription.mrr) / unitCount);
  }
  const lifeDays = Math.max(
    1,
    (now.getTime() - trailer.createdAt.getTime()) / 86_400_000
  );
  const lifetimeUtilization = Math.min(
    100,
    Math.round((deployedDays / lifeDays) * 100)
  );
  const net = revenueEstimate - totalMaintenanceCost;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {trailer.unitNumber}
            </h1>
            <Badge variant={statusBadgeVariant(trailer.status)}>
              {trailer.status}
            </Badge>
          </div>
          <p className="text-muted-foreground">{trailer.model ?? "—"}</p>
        </div>
        <div className="flex items-center gap-2">
          <TrailerStatusSelect trailerId={trailer.id} status={trailer.status} />
          <MaintenanceLogDialog trailerId={trailer.id} />
          <TrailerFormDialog
            trailer={{
              id: trailer.id,
              unitNumber: trailer.unitNumber,
              model: trailer.model,
              notes: trailer.notes,
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          {
            label: "Lifetime revenue (est.)",
            value: formatCurrency(Math.round(revenueEstimate)),
          },
          {
            label: "Maintenance cost",
            value: formatCurrency(totalMaintenanceCost),
          },
          {
            label: "Net (est.)",
            value: formatCurrency(Math.round(net)),
            negative: net < 0,
          },
          {
            label: "Lifetime utilization",
            value: `${lifetimeUtilization}%`,
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={`text-2xl font-bold ${
                  stat.negative ? "text-destructive" : ""
                }`}
              >
                {stat.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {currentDeployment && (
            <Card className="border-primary/50">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Currently deployed</CardTitle>
                <ReturnTrailerButton
                  deploymentId={currentDeployment.id}
                  unitNumber={trailer.unitNumber}
                />
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Site: </span>
                  {/* Plain text — see fleet/page.tsx: fleet users can't reach
                      the billing side. */}
                  <span className="font-medium">
                    {currentDeployment.subscription.project?.name ?? "—"}
                  </span>
                </p>
                {/* Where the unit physically is. A yard hand looking this up
                    needs an address they can drive to, so a city with no street
                    is called out rather than passed off as an address. */}
                <div>
                  <span className="text-muted-foreground">Address: </span>
                  {siteAddress ? (
                    <>
                      <span className="font-medium">{siteAddress}</span>
                      {mapsHref && (
                        <a
                          href={mapsHref}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <MapPin className="h-3 w-3" /> Directions
                        </a>
                      )}
                      {!siteStreetKnown && (
                        <span className="ml-2 text-xs text-destructive">
                          no street address on file
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-destructive">not on file</span>
                  )}
                </div>
                <p>
                  <span className="text-muted-foreground">Customer: </span>
                  <Link
                    href={`/companies/${currentDeployment.subscription.company.id}`}
                    className="font-medium hover:underline"
                  >
                    {currentDeployment.subscription.company.name}
                  </Link>
                </p>
                {currentDeployment.subscription.siteContact && (
                  <p>
                    <span className="text-muted-foreground">Site contact: </span>
                    <span className="font-medium">
                      {currentDeployment.subscription.siteContact.firstName}{" "}
                      {currentDeployment.subscription.siteContact.lastName}
                    </span>
                    {currentDeployment.subscription.siteContact.phone && (
                      <a
                        href={`tel:${currentDeployment.subscription.siteContact.phone}`}
                        className="ml-2 text-primary hover:underline"
                      >
                        {currentDeployment.subscription.siteContact.phone}
                      </a>
                    )}
                  </p>
                )}
                <p>
                  <span className="text-muted-foreground">Since: </span>
                  {formatDate(currentDeployment.deployedAt)}
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Deployment history</CardTitle>
            </CardHeader>
            <CardContent>
              {trailer.deployments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Never deployed.
                </p>
              ) : (
                <div className="divide-y">
                  {trailer.deployments.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">
                          {d.subscription.project?.name ??
                            d.subscription.company.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(d.deployedAt)} →{" "}
                          {d.returnedAt ? formatDate(d.returnedAt) : "present"}
                        </p>
                      </div>
                      {!d.returnedAt && <Badge>On site</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                Maintenance
                {totalMaintenanceCost > 0 &&
                  ` · ${formatCurrency(totalMaintenanceCost)} lifetime`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trailer.maintenanceLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No maintenance logged.
                </p>
              ) : (
                <div className="divide-y">
                  {trailer.maintenanceLogs.map((log) => (
                    <div key={log.id} className="py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {formatDate(log.date)}
                        </span>
                        {log.cost && (
                          <span className="text-muted-foreground">
                            {formatCurrency(Number(log.cost))}
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground">
                        {log.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Chatter
            messages={trailer.messages}
            parent={{ trailerId: trailer.id }}
            revalidate={`/fleet/${trailer.id}`}
          />
        </div>
      </div>
    </div>
  );
}
