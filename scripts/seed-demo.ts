/* One-off demo-scale seed: 8-rep sales team, 45 customers, 275 projects,
   340 trailers, with 2 years of subscription history so every dashboard
   has realistic data. Deterministic (seeded RNG). Safe to re-run: skips
   itself if the fleet is already at scale.

   Run: npx tsx scripts/seed-demo.ts
*/
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Deterministic RNG (mulberry32)
let seed = 20260810;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const int = (min: number, max: number) =>
  min + Math.floor(rand() * (max - min + 1));
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);
const daysAhead = (d: number) => new Date(Date.now() + d * 86_400_000);

const REPS = [
  ["Marcus", "Webb"],
  ["Tanya", "Ortiz"],
  ["Derek", "Callahan"],
  ["Priya", "Nair"],
  ["Jake", "Sorensen"],
  ["Alicia", "Grant"],
  ["Tom", "Ricci"],
];

const COMPANY_WORDS_A = [
  "Summit", "Ironclad", "Gulfstream", "Pinnacle", "BlueRock", "Cornerstone",
  "Meridian", "Atlas", "Redline", "Crestview", "Harbor", "Palmetto",
  "Suncoast", "Granite", "Silverline", "Northgate", "Everglade", "Bayfront",
  "Stonebridge", "Highpoint", "Keystone", "Lakeland", "Seminole", "Vanguard",
  "TriCounty", "Falcon", "Osprey", "Cypress", "Magnolia", "Riverbend",
  "Coastal", "Heartland", "Titan", "Beacon", "Foundry", "Legacy",
  "Landmark", "Patriot", "Frontier", "Compass", "Anchor", "Horizon",
];
const COMPANY_WORDS_B = [
  "Construction", "Builders", "Contracting", "Site Services", "Development",
  "Civil Group", "Infrastructure", "Excavation", "Paving", "Utilities",
];
const CITIES: [string, string][] = [
  ["Tampa", "FL"], ["Orlando", "FL"], ["Jacksonville", "FL"], ["Miami", "FL"],
  ["Fort Myers", "FL"], ["Sarasota", "FL"], ["Lakeland", "FL"],
  ["Gainesville", "FL"], ["Ocala", "FL"], ["Tallahassee", "FL"],
  ["Savannah", "GA"], ["Atlanta", "GA"], ["Valdosta", "GA"],
];
const PROJECT_KINDS = [
  "Distribution Center", "Retail Pad", "Apartment Complex", "Roadway Widening",
  "Substation", "Solar Farm", "Warehouse", "Medical Office", "Bridge Rehab",
  "Laydown Yard", "School Addition", "Parking Structure", "Interchange",
  "Logistics Hub", "Mixed-Use Tower", "Water Treatment", "Storage Facility",
];
const FIRST = ["Chris", "Pat", "Sam", "Jordan", "Casey", "Morgan", "Taylor", "Alex", "Riley", "Drew", "Lee", "Jamie"];
const LAST = ["Miller", "Johnson", "Garcia", "Smith", "Lopez", "Brown", "Davis", "Nguyen", "Clark", "Walker", "Hall", "Young"];
const SOURCES = ["Referral", "Website inquiry", "Cold call", "Trade show", "Repeat customer", "Google Ads"];

async function main() {
  const fleetCount = await prisma.trailer.count();
  if (fleetCount >= 300) {
    console.log(`Fleet already at ${fleetCount} units — demo seed appears to have run. Aborting.`);
    return;
  }

  // ---- Sales team: Florida East with 8 reps, Shawn managing ----
  const team = await prisma.salesTeam.upsert({
    where: { name: "Florida East" },
    update: {},
    create: { name: "Florida East" },
  });
  const passwordHash = await bcrypt.hash("bigview-temp-2026", 10);

  const repIds: string[] = [];
  for (const [first, last] of REPS) {
    const email = `${first.toLowerCase()}.${last.toLowerCase()}@jetstreamsys.com`;
    const rep = await prisma.user.upsert({
      where: { email },
      update: { salesTeamId: team.id },
      create: {
        email,
        name: `${first} ${last}`,
        passwordHash,
        role: "MEMBER",
        areas: ["SALES"],
        salesTeamId: team.id,
        commissionRate: int(4, 8),
      },
    });
    repIds.push(rep.id);
  }
  const bill = await prisma.user.findUnique({
    where: { email: "bill@jetstreamsys.com" },
  });
  const billAlt = bill ?? (await prisma.user.findFirst({ where: { name: { contains: "Bill" } } }));
  if (billAlt) {
    await prisma.user.update({
      where: { id: billAlt.id },
      data: { salesTeamId: team.id },
    });
    repIds.push(billAlt.id);
  }
  const shawn = await prisma.user.findUnique({
    where: { email: "shawn@jetstreamsys.com" },
  });
  if (shawn) {
    await prisma.user.update({
      where: { id: shawn.id },
      data: { salesTeamId: team.id },
    });
  }
  const sellerIds = [...repIds, ...(shawn ? [shawn.id] : [])];
  console.log(`Sales team ready: ${repIds.length} reps + manager.`);

  // ---- Companies (to 45 total) ----
  const existingCompanies = await prisma.company.count();
  const toCreate = Math.max(0, 45 - existingCompanies);
  const usedNames = new Set(
    (await prisma.company.findMany({ select: { name: true } })).map((c) => c.name)
  );
  const companyData: Prisma.CompanyCreateManyInput[] = [];
  while (companyData.length < toCreate) {
    const name = `${pick(COMPANY_WORDS_A)} ${pick(COMPANY_WORDS_B)}`;
    if (usedNames.has(name)) continue;
    usedNames.add(name);
    const [city, state] = pick(CITIES);
    companyData.push({ name, billingCity: city, billingState: state });
  }
  await prisma.company.createMany({ data: companyData });
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  console.log(`Companies: ${companies.length}.`);

  // ---- Contacts: 1-2 per company (billing contact on most) ----
  const companiesNeedingContacts = await prisma.company.findMany({
    where: { contacts: { none: {} } },
    select: { id: true },
  });
  const contactData: Prisma.ContactCreateManyInput[] = [];
  for (const c of companiesNeedingContacts) {
    const n = int(1, 2);
    for (let i = 0; i < n; i++) {
      const first = pick(FIRST);
      const last = pick(LAST);
      contactData.push({
        firstName: first,
        lastName: last,
        title: i === 0 ? "Project Manager" : "Accounts Payable",
        email: `${first.toLowerCase()}.${last.toLowerCase()}${int(1, 99)}@example.com`,
        phone: `+1${int(200, 989)}555${String(int(0, 9999)).padStart(4, "0")}`,
        companyId: c.id,
        isBillingContact: i === 1 || n === 1,
      });
    }
  }
  await prisma.contact.createMany({ data: contactData });
  console.log(`Contacts added: ${contactData.length}.`);

  // ---- Fleet to 340 units ----
  const existingUnits = new Set(
    (await prisma.trailer.findMany({ select: { unitNumber: true } })).map((t) => t.unitNumber)
  );
  const trailerData: Prisma.TrailerCreateManyInput[] = [];
  let unitNo = 101;
  while (existingUnits.size + trailerData.length < 340) {
    const unitNumber = `BV-${unitNo++}`;
    if (existingUnits.has(unitNumber)) continue;
    trailerData.push({
      unitNumber,
      model: rand() < 0.7 ? "BIGVIEW G2 Solar" : "BIGVIEW G3 Solar+LTE",
      status: "AVAILABLE",
    });
  }
  await prisma.trailer.createMany({ data: trailerData });
  const allTrailers = await prisma.trailer.findMany({
    select: { id: true, unitNumber: true, status: true },
    orderBy: { unitNumber: "asc" },
  });
  console.log(`Fleet: ${allTrailers.length} units.`);

  // ---- Projects to 275 (150 completed, 100 active, 25 upcoming) ----
  const existingProjects = await prisma.project.count();
  const projectData: Prisma.ProjectCreateManyInput[] = [];
  const statuses: ("COMPLETED" | "ACTIVE" | "UPCOMING")[] = [
    ...Array(150).fill("COMPLETED"),
    ...Array(100).fill("ACTIVE"),
    ...Array(25).fill("UPCOMING"),
  ];
  for (let i = existingProjects; i < 275; i++) {
    const status = statuses[i % statuses.length];
    const company = pick(companies);
    const [city, state] = pick(CITIES);
    const kind = pick(PROJECT_KINDS);
    const name = `${city} ${kind} ${rand() < 0.3 ? `Phase ${int(1, 3)}` : `#${int(100, 999)}`}`;
    let expectedStart: Date;
    let expectedEnd: Date;
    if (status === "COMPLETED") {
      expectedStart = daysAgo(int(120, 730));
      expectedEnd = new Date(expectedStart.getTime() + int(60, 270) * 86_400_000);
      if (expectedEnd > new Date()) expectedEnd = daysAgo(int(5, 60));
    } else if (status === "ACTIVE") {
      expectedStart = daysAgo(int(15, 365));
      expectedEnd = rand() < 0.15 ? daysAhead(int(3, 30)) : daysAhead(int(31, 200));
    } else {
      expectedStart = daysAhead(int(7, 90));
      expectedEnd = new Date(expectedStart.getTime() + int(60, 270) * 86_400_000);
    }
    projectData.push({
      name,
      companyId: company.id,
      status,
      siteCity: city,
      siteState: state,
      expectedStart,
      expectedEnd,
    });
  }
  await prisma.project.createMany({ data: projectData });
  const projects = await prisma.project.findMany({
    where: { subscriptions: { none: {} } },
    select: { id: true, companyId: true, status: true, expectedStart: true, expectedEnd: true },
  });
  console.log(`Projects: ${await prisma.project.count()} total, ${projects.length} needing subscriptions.`);

  // ---- Subscriptions: ENDED for completed projects, ACTIVE for active ----
  const END_REASONS = [
    "PROJECT_COMPLETED", "PROJECT_COMPLETED", "PROJECT_COMPLETED",
    "PROJECT_COMPLETED", "PROJECT_COMPLETED", "PROJECT_COMPLETED",
    "CUSTOMER_CANCELED", "LOST_TO_COMPETITOR", "NON_PAYMENT",
  ] as const;
  const subData: Prisma.SubscriptionCreateManyInput[] = [];
  for (const p of projects) {
    if (p.status === "UPCOMING") continue;
    const units = int(1, 3);
    const perUnit = pick([1850, 1950, 1950, 2100]);
    const cycleAmount = units * perUnit;
    if (p.status === "COMPLETED") {
      subData.push({
        status: "ENDED",
        startDate: p.expectedStart!,
        endedAt: p.expectedEnd!,
        endReason: pick([...END_REASONS]),
        billingCycle: "MONTHLY",
        cycleAmount,
        mrr: cycleAmount,
        companyId: p.companyId,
        projectId: p.id,
        salespersonId: pick(sellerIds),
      });
    } else {
      subData.push({
        status: rand() < 0.06 ? "PAST_DUE" : "ACTIVE",
        startDate: p.expectedStart!,
        billingCycle: "MONTHLY",
        cycleAmount,
        mrr: cycleAmount,
        companyId: p.companyId,
        projectId: p.id,
        salespersonId: pick(sellerIds),
      });
    }
  }
  await prisma.subscription.createMany({ data: subData });
  const newSubs = await prisma.subscription.findMany({
    where: { deployments: { none: {} } },
    select: { id: true, status: true, startDate: true, endedAt: true, mrr: true },
  });
  console.log(`Subscriptions created: ${subData.length}.`);

  // ---- Deployments ----
  const availableIds = allTrailers
    .filter((t) => t.status === "AVAILABLE")
    .map((t) => t.id);
  let cursor = 0;
  const deploymentData: Prisma.TrailerDeploymentCreateManyInput[] = [];
  const deployedNow = new Set<string>();
  for (const sub of newSubs) {
    const units = Math.max(1, Math.round(Number(sub.mrr) / 1950));
    if (sub.status === "ENDED") {
      // Historical deployments: any trailer, closed out.
      for (let i = 0; i < units; i++) {
        deploymentData.push({
          trailerId: pick(allTrailers).id,
          subscriptionId: sub.id,
          deployedAt: sub.startDate,
          returnedAt: sub.endedAt!,
        });
      }
    } else {
      for (let i = 0; i < units && cursor < availableIds.length; i++) {
        const trailerId = availableIds[cursor++];
        deployedNow.add(trailerId);
        deploymentData.push({
          trailerId,
          subscriptionId: sub.id,
          deployedAt: sub.startDate,
        });
      }
    }
  }
  await prisma.trailerDeployment.createMany({ data: deploymentData });
  await prisma.trailer.updateMany({
    where: { id: { in: [...deployedNow] } },
    data: { status: "DEPLOYED" },
  });
  console.log(`Deployments: ${deploymentData.length} (${deployedNow.size} units on site now).`);

  // ---- Remaining fleet: some maintenance/retired ----
  const idle = allTrailers.filter(
    (t) => !deployedNow.has(t.id) && t.status === "AVAILABLE"
  );
  const maintenanceIds = idle.slice(0, Math.floor(idle.length * 0.08)).map((t) => t.id);
  const retiredIds = idle.slice(-Math.floor(idle.length * 0.03)).map((t) => t.id);
  await prisma.trailer.updateMany({ where: { id: { in: maintenanceIds } }, data: { status: "MAINTENANCE" } });
  await prisma.trailer.updateMany({ where: { id: { in: retiredIds } }, data: { status: "RETIRED" } });

  // ---- Maintenance logs ----
  const maintData: Prisma.MaintenanceLogCreateManyInput[] = [];
  for (let i = 0; i < 180; i++) {
    maintData.push({
      trailerId: pick(allTrailers).id,
      date: daysAgo(int(1, 540)),
      description: pick([
        "Solar panel cleaning & battery health check",
        "Camera mast actuator replaced",
        "Tire replacement",
        "LTE modem swap",
        "Battery bank replacement",
        "Hitch and jack service",
        "Firmware update & sensor calibration",
      ]),
      cost: int(40, 900),
    });
  }
  await prisma.maintenanceLog.createMany({ data: maintData });

  // ---- Open pipeline: 3-6 leads per seller ----
  const leadData: Prisma.LeadCreateManyInput[] = [];
  const STAGES = ["NEW", "CONTACTED", "QUALIFIED", "QUOTE_SENT"] as const;
  for (const sellerId of sellerIds) {
    const n = int(3, 6);
    for (let i = 0; i < n; i++) {
      const company = pick(companies);
      const [city] = pick(CITIES);
      leadData.push({
        title: `${company.name} — ${city} ${pick(PROJECT_KINDS)}`,
        type: rand() < 0.6 ? "NEW_PROJECT" : "NEW_COMPANY",
        stage: pick([...STAGES]),
        estValue: int(4, 60) * 1000,
        source: pick(SOURCES),
        companyId: company.id,
        ownerId: sellerId,
        expectedClose: daysAhead(int(5, 60)),
        createdAt: daysAgo(int(0, 150)),
      });
    }
  }
  await prisma.lead.createMany({ data: leadData });
  console.log(`Open leads: ${leadData.length}.`);

  // ---- Activities: open (some overdue) + completed this week ----
  const activityData: Prisma.ActivityCreateManyInput[] = [];
  const ACT_TYPES = ["CALL", "EMAIL", "MEETING", "TASK", "SITE_VISIT"] as const;
  for (const sellerId of sellerIds) {
    for (let i = 0; i < int(2, 5); i++) {
      activityData.push({
        type: pick([...ACT_TYPES]),
        title: pick([
          "Follow up on quote",
          "Site walk with PM",
          "Confirm delivery access",
          "Renewal conversation",
          "Intro call",
          "Send updated pricing",
        ]),
        dueDate: rand() < 0.3 ? daysAgo(int(1, 5)) : daysAhead(int(0, 10)),
        assigneeId: sellerId,
        companyId: pick(companies).id,
      });
    }
    for (let i = 0; i < int(2, 6); i++) {
      activityData.push({
        type: pick([...ACT_TYPES]),
        title: pick([
          "Quote review call",
          "Left voicemail",
          "Emailed COI",
          "Site visit done",
          "Pricing discussion",
        ]),
        dueDate: daysAgo(int(1, 7)),
        done: true,
        completedAt: daysAgo(int(0, 6)),
        assigneeId: sellerId,
        companyId: pick(companies).id,
      });
    }
    // Prospecting: open outreach tasks + completed cold-call blocks
    for (let i = 0; i < int(2, 4); i++) {
      activityData.push({
        type: pick(["CALL", "EMAIL", "SITE_VISIT"] as const),
        title: pick([
          "Prospect: cold-call GC list for new jobsites",
          "Prospect: drive-by new construction on I-4 corridor",
          "Prospect: intro email to superintendent",
          "Prospect: follow permit filings for upcoming sites",
          "Prospect: drop off flyer at jobsite trailer",
          "Prospect: LinkedIn outreach to PM",
        ]),
        dueDate: rand() < 0.25 ? daysAgo(int(1, 4)) : daysAhead(int(0, 14)),
        assigneeId: sellerId,
        companyId: pick(companies).id,
      });
    }
    for (let i = 0; i < int(1, 4); i++) {
      activityData.push({
        type: pick(["CALL", "EMAIL", "SITE_VISIT"] as const),
        title: pick([
          "Prospect: cold-call block (20 dials)",
          "Prospect: visited 3 new jobsites",
          "Prospect: emailed 12 GCs from permit list",
          "Prospect: county permit sweep",
        ]),
        dueDate: daysAgo(int(1, 7)),
        done: true,
        completedAt: daysAgo(int(0, 6)),
        assigneeId: sellerId,
        companyId: pick(companies).id,
      });
    }
  }
  await prisma.activity.createMany({ data: activityData });
  console.log(`Activities: ${activityData.length}.`);

  // ---- Summary ----
  const [mrrAgg, activeCount, deployed] = await Promise.all([
    prisma.subscription.aggregate({
      where: { status: { in: ["ACTIVE", "PAST_DUE"] } },
      _sum: { mrr: true },
    }),
    prisma.subscription.count({ where: { status: { in: ["ACTIVE", "PAST_DUE"] } } }),
    prisma.trailer.count({ where: { status: "DEPLOYED" } }),
  ]);
  console.log("---- DONE ----");
  console.log(`Active subscriptions: ${activeCount}, MRR: $${Number(mrrAgg._sum.mrr ?? 0).toLocaleString()}`);
  console.log(`Deployed units: ${deployed}/340`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
