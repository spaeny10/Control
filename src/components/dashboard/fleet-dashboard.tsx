import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getFleetKpis } from "@/lib/kpi";
import { getDeliveryQueue, getPickupQueue } from "@/lib/dispatch-queues";
import { StatTiles, type StatTile } from "@/components/dashboard/stat-tiles";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { statusBadgeVariant } from "@/lib/badges";
import { addDays, format, isToday, startOfDay } from "date-fns";
import { Truck, Warehouse, Wrench, CalendarDays } from "lucide-react";

const JOB_LABEL = { DELIVERY: "Delivery", PICKUP: "Pickup", SERVICE: "Service" };

/* The yard's morning view: what's rolling this week, what needs a truck booked,
   and which units are out of service. */
export async function FleetDashboard() {
  const now = new Date();
  const weekEnd = addDays(startOfDay(now), 7);

  const [kpis, weekJobs, deliveries, pickups] = await Promise.all([
    getFleetKpis(),
    prisma.dispatchJob.findMany({
      where: {
        scheduledFor: { gte: startOfDay(now), lt: weekEnd },
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
      },
      orderBy: { scheduledFor: "asc" },
      include: {
        driver: { select: { name: true } },
        subscription: { include: { company: { select: { name: true } } } },
      },
    }),
    getDeliveryQueue(),
    getPickupQueue(),
  ]);

  const tiles: StatTile[] = [
    {
      label: "Trailer utilization",
      value: `${kpis.utilization}%`,
      sub: `${kpis.deployed} deployed / ${kpis.deployed + kpis.available + kpis.maintenance} active fleet`,
      icon: Truck,
      tint: "bg-[#2a78d6]/10 text-[#2a78d6]",
    },
    {
      label: "Available units",
      value: String(kpis.available),
      sub: "ready to deploy",
      icon: Warehouse,
      tint: "bg-[#eb6834]/10 text-[#eb6834]",
    },
    {
      label: "In maintenance",
      value: String(kpis.maintenance),
      sub: "out of service",
      icon: Wrench,
      tint:
        kpis.maintenance > 0
          ? "bg-destructive/10 text-destructive"
          : "bg-[#2a78d6]/10 text-[#2a78d6]",
    },
    {
      label: "Jobs next 7 days",
      value: String(weekJobs.length),
      sub: `${weekJobs.filter((j) => isToday(j.scheduledFor)).length} today`,
      icon: CalendarDays,
      tint: "bg-[#2a78d6]/10 text-[#2a78d6]",
    },
  ];

  // Group the week's jobs by day for a compact schedule list.
  const jobsByDay = new Map<string, typeof weekJobs>();
  for (const j of weekJobs) {
    const key = format(j.scheduledFor, "yyyy-MM-dd");
    jobsByDay.set(key, [...(jobsByDay.get(key) ?? []), j]);
  }

  const queueRow = (
    key: string,
    company: string,
    detail: string,
    when: string
  ) => (
    <div
      key={key}
      className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{company}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{when}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <StatTiles tiles={tiles} />

      {/* Work queues first — these are the balls in the air. Read-only here;
          the Schedule buttons live on Dispatch. */}
      {(deliveries.length > 0 || pickups.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {deliveries.length > 0 && (
            <Card className="border-[#2a78d6]/50">
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    Deliveries to schedule ({deliveries.length})
                  </CardTitle>
                  <CardDescription>
                    Customers waiting on equipment with no truck booked.
                  </CardDescription>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href="/dispatch">Schedule →</Link>
                </Button>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {deliveries.map((d) =>
                    queueRow(
                      d.subscriptionId,
                      d.company,
                      [
                        d.jobName ?? "No job linked",
                        d.siteCity &&
                          `${d.siteCity}${d.siteState ? `, ${d.siteState}` : ""}`,
                        d.units > 0 ? `${d.units} unit${d.units === 1 ? "" : "s"}` : "no units assigned",
                      ]
                        .filter(Boolean)
                        .join(" · "),
                      `starts ${formatDate(d.startDate)}`
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {pickups.length > 0 && (
            <Card className="border-[#eb6834]/50">
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    Pickups to schedule ({pickups.length})
                  </CardTitle>
                  <CardDescription>
                    Jobs winding down within 30 days, no pickup booked. End
                    dates are estimates — call before committing a truck.
                  </CardDescription>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href="/dispatch">Schedule →</Link>
                </Button>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {pickups.slice(0, 8).map((p) =>
                    queueRow(
                      p.projectId,
                      p.company,
                      [
                        p.jobName,
                        p.siteCity &&
                          `${p.siteCity}${p.siteState ? `, ${p.siteState}` : ""}`,
                      ]
                        .filter(Boolean)
                        .join(" · "),
                      `est. end ${formatDate(p.expectedEnd)}`
                    )
                  )}
                </div>
                {pickups.length > 8 && (
                  <p className="pt-2 text-xs text-muted-foreground">
                    Showing the 8 soonest of {pickups.length}.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                This week&apos;s schedule ({weekJobs.length})
              </CardTitle>
              <CardDescription>
                Deliveries, pickups, and service over the next 7 days.
              </CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/dispatch">Open dispatch →</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {weekJobs.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nothing on the calendar for the next 7 days.
              </p>
            ) : (
              <div className="space-y-3">
                {[...jobsByDay.entries()].map(([day, dayJobs]) => (
                  <div key={day}>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {isToday(dayJobs[0].scheduledFor)
                        ? "Today"
                        : format(dayJobs[0].scheduledFor, "EEEE, MMM d")}
                    </p>
                    <div className="divide-y">
                      {dayJobs.map((j) => (
                        <div
                          key={j.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {format(j.scheduledFor, "h:mm a")} ·{" "}
                              {JOB_LABEL[j.type]}
                              {j.subscription &&
                                ` · ${j.subscription.company.name}`}
                            </p>
                            {(j.siteAddress || j.driver) && (
                              <p className="truncate text-xs text-muted-foreground">
                                {[j.siteAddress, j.driver?.name]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            )}
                          </div>
                          {!j.driver && (
                            <Badge variant="outline">Unassigned</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              In maintenance ({kpis.inMaintenance.length})
            </CardTitle>
            <CardDescription>
              Units out of service and their latest shop note.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {kpis.inMaintenance.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Every unit is in service.
              </p>
            ) : (
              <div className="divide-y">
                {kpis.inMaintenance.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/fleet/${t.id}`}
                        className="font-medium hover:underline"
                      >
                        {t.unitNumber}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {t.lastLog ?? "No maintenance log yet"}
                        {t.lastLogDate && ` · ${formatDate(t.lastLogDate)}`}
                      </p>
                    </div>
                    <Badge variant={statusBadgeVariant("MAINTENANCE")}>
                      Maintenance
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
