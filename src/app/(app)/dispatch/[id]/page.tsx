import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { JobUnitsPanel, type JobUnit } from "@/components/dispatch/job-units-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { ArrowLeft, MapPin, Phone } from "lucide-react";

export const metadata = { title: "Dispatch job" };

const TYPE_LABEL = { DELIVERY: "Delivery", PICKUP: "Pickup", SERVICE: "Service visit" };

/* One job, as the driver works it: where to go, who to call, which units, and
   the condition record for each. Lives under Dispatch (FLEET area) rather than
   the subscription page, which drivers can't reach. */
export default async function DispatchJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await prisma.dispatchJob.findUnique({
    where: { id },
    include: {
      driver: { select: { name: true } },
      subscription: {
        select: {
          id: true,
          status: true,
          company: { select: { name: true } },
          project: {
            select: {
              name: true,
              siteStreet: true,
              siteCity: true,
              siteState: true,
              siteZip: true,
            },
          },
          siteContact: {
            select: { firstName: true, lastName: true, phone: true },
          },
        },
      },
    },
  });
  if (!job) notFound();

  const open = job.status === "SCHEDULED" || job.status === "IN_PROGRESS";
  const phase = job.type === "DELIVERY" ? "DELIVERY" : "RETURN";

  /* An open job offers every unit it could act on (pre-ticking the planned
     ones); a finished job shows only what actually moved. A finished pickup's
     deployments are closed, so look them up by trailer, most recent first. */
  let units: JobUnit[] = [];
  if (job.subscription && job.type !== "SERVICE") {
    const deployments = await prisma.trailerDeployment.findMany({
      where: open
        ? {
            subscriptionId: job.subscription.id,
            returnedAt: null,
            deliveredAt: job.type === "DELIVERY" ? null : { not: null },
          }
        : { subscriptionId: job.subscription.id, trailerId: { in: job.trailerIds } },
      orderBy: [{ trailer: { unitNumber: "asc" } }, { deployedAt: "desc" }],
      select: {
        id: true,
        trailerId: true,
        trailer: { select: { unitNumber: true } },
        photos: { where: { phase }, select: { id: true } },
        signatures: { where: { phase }, select: { id: true } },
      },
    });
    const seen = new Set<string>();
    const planned = new Set(job.trailerIds);
    for (const d of deployments) {
      if (seen.has(d.trailerId)) continue;
      seen.add(d.trailerId);
      units.push({
        trailerId: d.trailerId,
        unitNumber: d.trailer.unitNumber,
        deploymentId: d.id,
        // A job booked before units were tracked on jobs plans all of them.
        planned: planned.size === 0 || planned.has(d.trailerId),
        photoCount: d.photos.length,
        signed: d.signatures.length > 0,
      });
    }
  }
  units = units.sort((a, b) => Number(b.planned) - Number(a.planned));

  const site = job.subscription?.project;
  const fullAddress = site?.siteStreet
    ? [site.siteStreet, site.siteCity, [site.siteState, site.siteZip].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", ")
    : null;
  const address = fullAddress ?? job.siteAddress;
  const contact = job.subscription?.siteContact;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href={`/dispatch?week=${format(job.scheduledFor, "yyyy-MM-dd")}`}>
            <ArrowLeft className="h-4 w-4" /> Dispatch
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {TYPE_LABEL[job.type]}
            {job.subscription && ` — ${job.subscription.company.name}`}
          </h1>
          <Badge variant={job.status === "CANCELED" ? "destructive" : "secondary"}>
            {job.status.replace("_", " ").toLowerCase()}
          </Badge>
        </div>
        <p className="text-muted-foreground">
          {format(job.scheduledFor, "EEEE, MMM d 'at' h:mm a")}
          {" · "}
          {job.driver?.name ?? "No driver assigned"}
          {job.completedAt && ` · completed ${formatDate(job.completedAt)}`}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              {job.type === "SERVICE"
                ? "Visit"
                : `Units to ${job.type === "DELIVERY" ? "deliver" : "pick up"}`}
            </CardTitle>
            <CardDescription>
              {job.type === "DELIVERY"
                ? "Ticking a unit and completing marks it on site. Billing is separate — it starts on activation, whether or not the units are already there."
                : job.type === "PICKUP"
                  ? "Ticking a unit and completing returns it to the yard for inspection. It doesn't end billing."
                  : "A service visit doesn't move any units."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <JobUnitsPanel
              jobId={job.id}
              type={job.type}
              status={job.status}
              units={units}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Site</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {site?.name && <p className="font-medium">{site.name}</p>}
            {address ? (
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p>{address}</p>
                  {fullAddress ? (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fullAddress)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      Directions →
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No street address on file — confirm with the site contact.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">No site address on file.</p>
            )}
            {contact ? (
              <div className="flex items-start gap-2">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p>
                    {contact.firstName} {contact.lastName}
                  </p>
                  {contact.phone ? (
                    <a href={`tel:${contact.phone}`} className="text-xs text-primary hover:underline">
                      {contact.phone}
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground">No phone on file</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">No site contact on file.</p>
            )}
            {job.notes && (
              <div className="rounded-md bg-muted/50 p-2 text-xs whitespace-pre-wrap">
                {job.notes}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
