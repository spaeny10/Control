import { prisma } from "@/lib/prisma";
import { addDays, differenceInCalendarDays } from "date-fns";

/* The dispatch work queues, shared by the Dispatch page (where they carry
   Schedule buttons) and the dashboards (read-only heads-ups). One definition
   so the surfaces can't drift.

   All of them are driven by where units physically are — an open deployment
   with or without deliveredAt — not by billing status, because the two move
   independently: units can be dropped weeks before activation, and billing can
   end before the truck gets there. */

export type DeliveryQueueItem = {
  subscriptionId: string;
  company: string;
  jobName: string | null;
  siteCity: string | null;
  siteState: string | null;
  /** PENDING = billing hasn't started; delivering early is fine. */
  billingStatus: string;
  /** Billing start (actual, or scheduled for a PENDING one). */
  activationDate: Date | null;
  units: number;
  assignedSince: Date;
};

export type PickupQueueItem = {
  subscriptionId: string;
  company: string;
  jobName: string | null;
  siteCity: string | null;
  siteState: string | null;
  /** billing-ended: confirmed, the equipment just hasn't come back.
      ending-soon: an estimate from the job's expected end date. */
  reason: "billing-ended" | "ending-soon";
  date: Date | null;
  units: number;
};

const OPEN_DELIVERY = {
  type: "DELIVERY" as const,
  status: { in: ["SCHEDULED" as const, "IN_PROGRESS" as const] },
};
const OPEN_PICKUP = {
  type: "PICKUP" as const,
  status: { in: ["SCHEDULED" as const, "IN_PROGRESS" as const] },
};

/* Units assigned to a contract but still in the yard, with no truck booked.
   Unbounded by date: an undelivered unit is actionable however old it is, and
   history is backfilled as delivered, so this doesn't drag in the archive. */
export async function getDeliveryQueue(): Promise<DeliveryQueueItem[]> {
  const rows = await prisma.subscription.findMany({
    where: {
      status: { not: "ENDED" },
      deployments: { some: { returnedAt: null, deliveredAt: null } },
      dispatchJobs: { none: OPEN_DELIVERY },
    },
    include: {
      company: { select: { name: true } },
      project: { select: { name: true, siteCity: true, siteState: true } },
      deployments: {
        where: { returnedAt: null, deliveredAt: null },
        select: { deployedAt: true },
        orderBy: { deployedAt: "asc" },
      },
    },
  });
  return rows
    .map((s) => ({
      subscriptionId: s.id,
      company: s.company.name,
      jobName: s.project?.name ?? null,
      siteCity: s.project?.siteCity ?? null,
      siteState: s.project?.siteState ?? null,
      billingStatus: s.status,
      activationDate: s.activatedAt ?? s.nextInvoiceDate,
      units: s.deployments.length,
      assignedSince: s.deployments[0].deployedAt,
    }))
    /* Already billing first — that customer is paying for equipment they don't
       have. Then by activation date, soonest first; undated last. */
    .sort((a, b) => {
      const billingA = a.billingStatus === "PENDING" ? 1 : 0;
      const billingB = b.billingStatus === "PENDING" ? 1 : 0;
      if (billingA !== billingB) return billingA - billingB;
      const ta = a.activationDate?.getTime() ?? Infinity;
      const tb = b.activationDate?.getTime() ?? Infinity;
      return ta - tb;
    });
}

/* Units on site that need to come back, with no pickup booked.

   Billing-ended comes first and is certain: the customer stopped paying, the
   equipment is still out. Ending-soon is a forecast from the project's
   expected end — worth a call before committing a truck. */
export async function getPickupQueue(): Promise<PickupQueueItem[]> {
  const now = new Date();
  const onSite = { returnedAt: null, deliveredAt: { not: null } };
  const include = {
    company: { select: { name: true } },
    project: {
      select: { name: true, siteCity: true, siteState: true, expectedEnd: true },
    },
    _count: { select: { deployments: { where: onSite } } },
  };

  const [ended, ending] = await Promise.all([
    prisma.subscription.findMany({
      where: {
        status: "ENDED",
        deployments: { some: onSite },
        dispatchJobs: { none: OPEN_PICKUP },
      },
      include,
      orderBy: { endedAt: "asc" },
    }),
    prisma.subscription.findMany({
      where: {
        status: { in: ["ACTIVE", "PAST_DUE", "PENDING"] },
        deployments: { some: onSite },
        dispatchJobs: { none: OPEN_PICKUP },
        // A past-due estimate still counts — the job may have quietly finished.
        project: { expectedEnd: { gte: addDays(now, -30), lte: addDays(now, 30) } },
      },
      include,
      orderBy: { project: { expectedEnd: "asc" } },
    }),
  ]);

  const row = (
    s: (typeof ended)[number],
    reason: PickupQueueItem["reason"],
    date: Date | null
  ): PickupQueueItem => ({
    subscriptionId: s.id,
    company: s.company.name,
    jobName: s.project?.name ?? null,
    siteCity: s.project?.siteCity ?? null,
    siteState: s.project?.siteState ?? null,
    reason,
    date,
    units: s._count.deployments,
  });

  return [
    ...ended.map((s) => row(s, "billing-ended", s.endedAt)),
    ...ending.map((s) => row(s, "ending-soon", s.project?.expectedEnd ?? null)),
  ];
}

export type StagedItem = {
  subscriptionId: string;
  company: string;
  jobName: string | null;
  units: number;
  deliveredAt: Date;
  daysStaged: number;
  scheduledActivation: Date | null;
};

/* On site, not billing. Normal for a while — units are often dropped early
   because a truck was already headed that way — but it's free equipment until
   someone activates, so accounting needs it in view. */
export async function getStagedQueue(asOf = new Date()): Promise<StagedItem[]> {
  const rows = await prisma.subscription.findMany({
    where: {
      status: "PENDING",
      deployments: { some: { returnedAt: null, deliveredAt: { not: null } } },
    },
    include: {
      company: { select: { name: true } },
      project: { select: { name: true } },
      deployments: {
        where: { returnedAt: null, deliveredAt: { not: null } },
        select: { deliveredAt: true },
        orderBy: { deliveredAt: "asc" },
      },
    },
  });
  return rows
    .map((s) => {
      const first = s.deployments[0].deliveredAt!;
      return {
        subscriptionId: s.id,
        company: s.company.name,
        jobName: s.project?.name ?? null,
        units: s.deployments.length,
        deliveredAt: first,
        daysStaged: differenceInCalendarDays(asOf, first),
        scheduledActivation: s.nextInvoiceDate,
      };
    })
    .sort((a, b) => b.daysStaged - a.daysStaged);
}

export type ReturnedStillBillingItem = {
  subscriptionId: string;
  company: string;
  jobName: string | null;
  lastReturnedAt: Date | null;
};

/* Every unit back in the yard while the contract still bills. Almost always a
   missed End billing — and the customer will dispute the next invoice. */
export async function getReturnedStillBilling(): Promise<ReturnedStillBillingItem[]> {
  const rows = await prisma.subscription.findMany({
    where: {
      status: { in: ["ACTIVE", "PAST_DUE"] },
      deployments: { some: {}, none: { returnedAt: null } },
    },
    include: {
      company: { select: { name: true } },
      project: { select: { name: true } },
      deployments: {
        select: { returnedAt: true },
        orderBy: { returnedAt: "desc" },
        take: 1,
      },
    },
  });
  return rows.map((s) => ({
    subscriptionId: s.id,
    company: s.company.name,
    jobName: s.project?.name ?? null,
    lastReturnedAt: s.deployments[0]?.returnedAt ?? null,
  }));
}
