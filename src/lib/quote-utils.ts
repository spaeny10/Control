// Shared helpers for loading quote-builder options and computing totals.
import { prisma } from "@/lib/prisma";
import { fullName } from "@/lib/format";
import { toMonthly, isRecurring } from "@/lib/cycles";
import type { BillingCycle } from "@prisma/client";

export async function getQuoteBuilderOptions() {
  const [companies, contacts, projects, leads, catalog, overrides] =
    await Promise.all([
    prisma.company.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.contact.findMany({
      orderBy: { lastName: "asc" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        companyId: true,
        isBillingContact: true,
      },
    }),
    prisma.project.findMany({
      where: { status: { not: "COMPLETED" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, companyId: true },
    }),
    prisma.lead.findMany({
      where: {
        // Organizations aren't quotable — you quote a job, not a company.
        type: "NEW_PROJECT",
        OR: [
          { stage: { notIn: ["WON", "LOST"] } },
          /* A won lead stays quotable until it's actually converted. Leads go
             WON at quote acceptance now, and change orders, added trailers, and
             corrected quotes all land in exactly that window — without this the
             lead would silently vanish from the picker. */
          { stage: "WON", quotes: { none: { subscriptions: { some: {} } } } },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, companyId: true, projectId: true },
    }),
    prisma.planProduct.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: { prices: { orderBy: { cycle: "asc" } } },
    }),
    prisma.companyPrice.findMany(),
  ]);

  // { companyId: { "planProductId:cycle": negotiatedPrice } }
  const priceOverrides: Record<string, Record<string, number>> = {};
  for (const o of overrides) {
    (priceOverrides[o.companyId] ??= {})[`${o.planProductId}:${o.cycle}`] =
      Number(o.unitPrice);
  }

  return {
    companies,
    contacts: contacts.map((c) => ({
      id: c.id,
      name: fullName(c),
      companyId: c.companyId,
      isBillingContact: c.isBillingContact,
    })),
    projects,
    leads: leads.map((l) => ({
      id: l.id,
      name: l.title,
      companyId: l.companyId,
      projectId: l.projectId,
    })),
    catalog: catalog.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      prices: p.prices.map((price) => ({
        cycle: price.cycle,
        unitPrice: Number(price.unitPrice),
      })),
    })),
    priceOverrides,
  };
}

export type QuoteTotals = {
  // Per recurring cycle, e.g. { WEEKLY: 900 }
  recurring: Partial<Record<BillingCycle, number>>;
  oneTime: number;
  // Normalized monthly value of all recurring items.
  monthlyEquivalent: number;
  // Recurring first period + one-time charges.
  firstInvoice: number;
};

export function quoteTotals(
  lineItems: { cycle: BillingCycle; quantity: number; unitPrice: unknown }[]
): QuoteTotals {
  const recurring: Partial<Record<BillingCycle, number>> = {};
  let oneTime = 0;
  let monthlyEquivalent = 0;
  let recurringFirstPeriod = 0;

  for (const item of lineItems) {
    const amount = item.quantity * Number(item.unitPrice);
    if (isRecurring(item.cycle)) {
      recurring[item.cycle] = (recurring[item.cycle] ?? 0) + amount;
      monthlyEquivalent += toMonthly(amount, item.cycle);
      recurringFirstPeriod += amount;
    } else {
      oneTime += amount;
    }
  }

  return {
    recurring,
    oneTime,
    monthlyEquivalent,
    firstInvoice: recurringFirstPeriod + oneTime,
  };
}
