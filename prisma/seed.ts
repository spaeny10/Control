import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // ---- Admin user ----
  const passwordHash = await bcrypt.hash("bigview-temp-2026", 10);
  const admin = await prisma.user.upsert({
    where: { email: "shawn@jetstreamsys.com" },
    update: {},
    create: {
      email: "shawn@jetstreamsys.com",
      name: "Shawn",
      passwordHash,
      role: "ADMIN",
    },
  });
  console.log(`Admin user ready: ${admin.email} (temp password: bigview-temp-2026 — change it!)`);

  // ---- Price catalog (per-cycle prices) ----
  const catalog = [
    {
      name: "BIGVIEW Trailer Rental",
      description: "Solar security trailer with live monitoring, per unit",
      prices: [
        { cycle: "DAILY" as const, unitPrice: 125 },
        { cycle: "WEEKLY" as const, unitPrice: 650 },
        { cycle: "EVERY_28_DAYS" as const, unitPrice: 1850 },
        { cycle: "MONTHLY" as const, unitPrice: 1950 },
      ],
    },
    {
      name: "Delivery & Setup",
      description: "Delivery, positioning, and commissioning per unit",
      prices: [{ cycle: "ONE_TIME" as const, unitPrice: 350 }],
    },
    {
      name: "Pickup & Removal",
      description: "End-of-project pickup per unit",
      prices: [{ cycle: "ONE_TIME" as const, unitPrice: 350 }],
    },
  ];
  for (const item of catalog) {
    const existing = await prisma.planProduct.findFirst({
      where: { name: item.name },
    });
    if (!existing) {
      await prisma.planProduct.create({
        data: {
          name: item.name,
          description: item.description,
          prices: { create: item.prices },
        },
      });
    }
  }
  console.log("Price catalog seeded.");

  // ---- Demo fleet ----
  const units = ["BV-101", "BV-102", "BV-103", "BV-104", "BV-105", "BV-106"];
  for (const unitNumber of units) {
    await prisma.trailer.upsert({
      where: { unitNumber },
      update: {},
      create: { unitNumber, model: "BIGVIEW G2 Solar", status: "AVAILABLE" },
    });
  }
  console.log(`Fleet seeded: ${units.length} trailers.`);

  // ---- Demo CRM data (skip if companies already exist) ----
  const companyCount = await prisma.company.count();
  if (companyCount === 0) {
    const acme = await prisma.company.create({
      data: {
        name: "Acme Construction Group",
        billingCity: "Tampa",
        billingState: "FL",
        contacts: {
          create: [
            {
              firstName: "Dana",
              lastName: "Rivera",
              title: "Project Manager",
              email: "dana.rivera@example.com",
              phone: "+18135550142",
            },
          ],
        },
      },
      include: { contacts: true },
    });

    const summit = await prisma.company.create({
      data: {
        name: "Summit Site Services",
        billingCity: "Orlando",
        billingState: "FL",
        contacts: {
          create: [
            {
              firstName: "Mike",
              lastName: "Chen",
              title: "Operations Director",
              email: "mike.chen@example.com",
              phone: "+14075550178",
            },
          ],
        },
      },
      include: { contacts: true },
    });

    const project = await prisma.project.create({
      data: {
        name: "Westshore Plaza Redevelopment",
        companyId: acme.id,
        status: "UPCOMING",
        siteCity: "Tampa",
        siteState: "FL",
        expectedStart: new Date("2026-09-01"),
        expectedEnd: new Date("2027-03-31"),
      },
    });

    await prisma.lead.create({
      data: {
        title: "Westshore Plaza — 2 trailers, 7 months",
        type: "NEW_PROJECT",
        stage: "QUALIFIED",
        estValue: 27300,
        source: "Repeat customer",
        companyId: acme.id,
        contactId: acme.contacts[0].id,
        projectId: project.id,
        ownerId: admin.id,
        expectedClose: new Date("2026-08-25"),
      },
    });

    await prisma.lead.create({
      data: {
        title: "Summit Site Services — intro call",
        type: "NEW_COMPANY",
        stage: "CONTACTED",
        estValue: 12000,
        source: "Website inquiry",
        companyId: summit.id,
        contactId: summit.contacts[0].id,
        ownerId: admin.id,
      },
    });
    console.log("Demo CRM data seeded (2 companies, 1 project, 2 leads).");
  } else {
    console.log("Companies already exist — skipping demo CRM data.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
