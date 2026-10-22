import { addMonths, startOfDay } from "date-fns";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/* Activation = the moment billing starts. Independent of delivery: units can be
   on site for weeks before this, and that's normal.

   One implementation shared by quote conversion (activate today), the manual
   Activate button, and the billing run (scheduled activation), so the three
   paths can't drift on what "activated" sets. */

export type ActivationResult =
  | { ok: true; activatedAt: Date }
  | { ok: false; reason: string };

export async function activateSubscription(
  subscriptionId: string,
  date: Date,
  actorId?: string | null
): Promise<ActivationResult> {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      status: true,
      projectId: true,
      project: { select: { expectedStart: true, expectedEnd: true } },
      quote: { select: { lead: { select: { estMonths: true } } } },
    },
  });
  if (!sub) return { ok: false, reason: "Subscription not found" };
  if (sub.status !== "PENDING") {
    return { ok: false, reason: `Subscription is already ${sub.status}` };
  }

  /* Rent is billed in advance from activation, so the anchor and the first
     invoice date are both the activation date. The billing anchor is what keeps
     every later invoice on the same day of the month. */
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: "ACTIVE",
        activatedAt: date,
        startDate: date,
        billingAnchor: date,
        nextInvoiceDate: date,
      },
    }),
  ];

  if (sub.projectId) {
    /* The job is live from activation, not from when units were dropped.
       Projects created from a lead carry no dates, and the pickup queue
       forecasts off expectedEnd, so derive one from the rep's estimated rental
       length when there isn't one. Ops can correct it under Site & schedule. */
    const months = sub.quote?.lead?.estMonths ?? null;
    ops.push(
      prisma.project.update({
        where: { id: sub.projectId },
        data: {
          status: "ACTIVE",
          ...(sub.project?.expectedStart ? {} : { expectedStart: date }),
          ...(!sub.project?.expectedEnd && months
            ? { expectedEnd: addMonths(date, months) }
            : {}),
        },
      })
    );
  }

  ops.push(
    prisma.message.create({
      data: {
        channel: "SYSTEM",
        body: `Billing activated ${date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })} — first invoice covers the period starting that day.`,
        authorId: actorId ?? undefined,
        subscriptionId: sub.id,
      },
    })
  );

  await prisma.$transaction(ops);
  return { ok: true, activatedAt: date };
}

/** True when a date is today or earlier, comparing whole days. */
export function isDueBy(date: Date, asOf = new Date()): boolean {
  return startOfDay(date) <= startOfDay(asOf);
}
