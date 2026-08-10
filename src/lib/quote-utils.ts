// Shared helpers for loading quote-builder options and computing totals.
import { prisma } from "@/lib/prisma";
import { fullName } from "@/lib/format";

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
      where: { stage: { notIn: ["WON", "LOST"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, companyId: true, projectId: true },
    }),
    prisma.planProduct.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.companyPrice.findMany(),
  ]);

  // { companyId: { planProductId: negotiatedPrice } }
  const priceOverrides: Record<string, Record<string, number>> = {};
  for (const o of overrides) {
    (priceOverrides[o.companyId] ??= {})[o.planProductId] = Number(
      o.unitPrice
    );
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
      kind: p.kind,
      unitPrice: Number(p.unitPrice),
      description: p.description,
    })),
    priceOverrides,
  };
}

export function quoteTotals(
  lineItems: { kind: string; quantity: number; unitPrice: unknown }[]
) {
  const monthly = lineItems
    .filter((i) => i.kind === "RECURRING_MONTHLY")
    .reduce((sum, i) => sum + i.quantity * Number(i.unitPrice), 0);
  const oneTime = lineItems
    .filter((i) => i.kind === "ONE_TIME")
    .reduce((sum, i) => sum + i.quantity * Number(i.unitPrice), 0);
  return { monthly, oneTime, firstInvoice: monthly + oneTime };
}
