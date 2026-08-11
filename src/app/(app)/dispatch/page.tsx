import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getDeliveryQueue, getPickupQueue } from "@/lib/dispatch-queues";
import { JobFormDialog } from "@/components/dispatch/job-form-dialog";
import { JobCard, type DispatchJobView } from "@/components/dispatch/job-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import {
  startOfWeek,
  addDays,
  addWeeks,
  format,
  isSameDay,
  isToday,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const metadata = { title: "Dispatch" };

export default async function DispatchPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const anchor = week ? new Date(`${week}T00:00:00`) : new Date();
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const now = new Date();
  const [jobs, drivers, activeSubs, pickupsNeeded, deliveriesNeeded] =
    await Promise.all([
      prisma.dispatchJob.findMany({
        where: { scheduledFor: { gte: weekStart, lt: weekEnd } },
        orderBy: { scheduledFor: "asc" },
        include: {
          driver: { select: { name: true } },
          subscription: {
            include: { company: { select: { name: true } } },
          },
        },
      }),
      prisma.user.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.subscription.findMany({
        where: { status: { not: "ENDED" } },
        include: {
          company: { select: { name: true } },
          project: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      // Shared with the Fleet dashboard — one definition of each queue, so the
      // two surfaces can't drift. See src/lib/dispatch-queues.ts for the
      // reasoning behind the scoping.
      getPickupQueue(),
      getDeliveryQueue(),
    ]);

  const subscriptionOptions = activeSubs.map((s) => ({
    id: s.id,
    label: `${s.company.name}${s.project ? ` — ${s.project.name}` : ""}`,
  }));

  const prevWeek = format(addWeeks(weekStart, -1), "yyyy-MM-dd");
  const nextWeek = format(addWeeks(weekStart, 1), "yyyy-MM-dd");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dispatch</h1>
          <p className="text-muted-foreground">
            Week of {format(weekStart, "MMM d, yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/dispatch?week=${prevWeek}`}>
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dispatch">Today</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/dispatch?week=${nextWeek}`}>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
          <JobFormDialog
            drivers={drivers}
            subscriptions={subscriptionOptions}
          />
        </div>
      </div>

      {/* Trailers owed to a customer. Ahead of pickups because someone is
          waiting on equipment that the system already counts as deployed. */}
      {deliveriesNeeded.length > 0 && (
        <Card className="border-[#2a78d6]/50">
          <CardHeader>
            <CardTitle className="text-base">
              Deliveries to schedule ({deliveriesNeeded.length})
            </CardTitle>
            <CardDescription>
              These jobs started recently and have no delivery on the calendar.
              Converting a quote marks the trailers deployed straight away, so
              until a truck is booked the customer is still waiting.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {deliveriesNeeded.map((s) => (
                <div
                  key={s.subscriptionId}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{s.company}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.jobName ?? "No job linked"}
                      {s.siteCity && ` · ${s.siteCity}`}
                      {s.siteState && `, ${s.siteState}`}
                      {" · starts "}
                      {formatDate(s.startDate)}
                      {" · "}
                      {s.units > 0 ? (
                        `${s.units} unit${s.units === 1 ? "" : "s"}`
                      ) : (
                        <span className="text-destructive">
                          no units assigned yet
                        </span>
                      )}
                    </p>
                  </div>
                  <JobFormDialog
                    drivers={drivers}
                    subscriptions={subscriptionOptions}
                    triggerLabel="Schedule delivery"
                    prefill={{
                      type: "DELIVERY",
                      subscriptionId: s.subscriptionId,
                      // Its start date if that's still ahead of us, otherwise
                      // tomorrow — it's already overdue.
                      scheduledFor: format(
                        s.startDate > now ? s.startDate : addDays(now, 1),
                        "yyyy-MM-dd'T'09:00",
                      ),
                    }}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {pickupsNeeded.length > 0 && (
        <Card className="border-[#eb6834]/50">
          <CardHeader>
            <CardTitle className="text-base">
              Pickups to schedule ({pickupsNeeded.length})
            </CardTitle>
            <CardDescription>
              These jobs are due to wind down within 30 days with no pickup
              booked. The end date is our estimate, not the customer&apos;s word
              — worth a call before you commit a truck. Collecting the trailers
              doesn&apos;t stop billing; use End subscription on the job for
              that.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {pickupsNeeded.map((p) => (
                <div
                  key={p.projectId}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <div className="min-w-0">
                    {/* Customer first: a dispatcher thinks "Seminole Paving in
                        Fort Myers", not "Fort Myers Warehouse Phase 1". */}
                    <p className="font-medium">{p.company}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.jobName}
                      {p.siteCity && ` · ${p.siteCity}`}
                      {p.siteState && `, ${p.siteState}`}
                      {" · est. end "}
                      {formatDate(p.expectedEnd)}
                    </p>
                  </div>
                  {p.subscriptionId && (
                    <JobFormDialog
                      drivers={drivers}
                      subscriptions={subscriptionOptions}
                      triggerLabel="Schedule pickup"
                      prefill={{
                        type: "PICKUP",
                        subscriptionId: p.subscriptionId,
                        scheduledFor: p.expectedEnd
                          ? format(p.expectedEnd, "yyyy-MM-dd'T'09:00")
                          : undefined,
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
        {days.map((day) => {
          const dayJobs = jobs.filter((j) => isSameDay(j.scheduledFor, day));
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-32 rounded-lg border bg-muted/30 p-2",
                isToday(day) && "border-primary bg-primary/5",
              )}
            >
              <p
                className={cn(
                  "mb-2 text-xs font-semibold",
                  isToday(day) ? "text-primary" : "text-muted-foreground",
                )}
              >
                {format(day, "EEE d")}
              </p>
              <div className="space-y-1.5">
                {dayJobs.map((j) => {
                  const view: DispatchJobView = {
                    id: j.id,
                    type: j.type,
                    status: j.status,
                    time: format(j.scheduledFor, "h:mm a"),
                    siteAddress: j.siteAddress,
                    driverName: j.driver?.name ?? null,
                    companyName: j.subscription?.company.name ?? null,
                    notes: j.notes,
                  };
                  return <JobCard key={j.id} job={view} />;
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
