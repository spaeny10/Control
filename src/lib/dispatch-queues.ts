import { prisma } from "@/lib/prisma";
import { addDays } from "date-fns";

/* The two dispatch work queues, shared by the Dispatch page (where they carry
   Schedule buttons) and the Fleet dashboard (where they're a read-only heads-up
   linking to Dispatch). One definition so the two surfaces can't drift. */

export type DeliveryQueueItem = {
  subscriptionId: string;
  company: string;
  jobName: string | null;
  siteCity: string | null;
  siteState: string | null;
  startDate: Date;
  units: number;
};

export type PickupQueueItem = {
  projectId: string;
  subscriptionId: string | null;
  company: string;
  jobName: string;
  siteCity: string | null;
  siteState: string | null;
  expectedEnd: Date | null;
};

/* Live subscriptions with no delivery booked. Converting a quote marks trailers
   DEPLOYED immediately, but nothing physically moves until a truck is booked —
   so each of these is a customer waiting on equipment.

   Scoped to recent and upcoming starts on purpose: unbounded, this matches
   every subscription in two years of history that predates dispatch, which
   would bury the handful that are actionable. */
export async function getDeliveryQueue(): Promise<DeliveryQueueItem[]> {
  const rows = await prisma.subscription.findMany({
    where: {
      status: { not: "ENDED" },
      startDate: { gte: addDays(new Date(), -14) },
      dispatchJobs: {
        none: {
          type: "DELIVERY",
          status: { in: ["SCHEDULED", "IN_PROGRESS", "DONE"] },
        },
      },
    },
    include: {
      company: { select: { name: true } },
      project: { select: { name: true, siteCity: true, siteState: true } },
      _count: { select: { deployments: true } },
    },
    orderBy: { startDate: "asc" },
  });
  return rows.map((s) => ({
    subscriptionId: s.id,
    company: s.company.name,
    jobName: s.project?.name ?? null,
    siteCity: s.project?.siteCity ?? null,
    siteState: s.project?.siteState ?? null,
    startDate: s.startDate,
    units: s._count.deployments,
  }));
}

/* Jobs due to wind down within 30 days with no pickup booked. The end date is
   an estimate (seeded, or derived from the lead's rental length), not the
   customer's word — surfaces should say so. */
export async function getPickupQueue(): Promise<PickupQueueItem[]> {
  const now = new Date();
  const rows = await prisma.project.findMany({
    where: {
      status: "ACTIVE",
      expectedEnd: { gte: now, lte: addDays(now, 30) },
      subscriptions: {
        some: {
          status: { not: "ENDED" },
          dispatchJobs: {
            none: {
              type: "PICKUP",
              status: { in: ["SCHEDULED", "IN_PROGRESS"] },
            },
          },
        },
      },
    },
    include: {
      company: { select: { name: true } },
      subscriptions: {
        where: { status: { not: "ENDED" } },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: { expectedEnd: "asc" },
  });
  return rows.map((p) => ({
    projectId: p.id,
    subscriptionId: p.subscriptions[0]?.id ?? null,
    company: p.company.name,
    jobName: p.name,
    siteCity: p.siteCity,
    siteState: p.siteState,
    expectedEnd: p.expectedEnd,
  }));
}
