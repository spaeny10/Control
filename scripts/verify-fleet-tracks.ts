/* Read-only snapshot of the physical/billing tracks: queue sizes, utilization,
   and anything inconsistent between trailer status and its open deployment.
   Run: npx tsx scripts/verify-fleet-tracks.ts */
import { prisma } from "../src/lib/prisma";
import {
  getDeliveryQueue,
  getPickupQueue,
  getStagedQueue,
  getReturnedStillBilling,
} from "../src/lib/dispatch-queues";
import { getDueInvoiceQueue } from "../src/lib/billing";
import { getFleetKpis } from "../src/lib/kpi";

async function main() {
  const [delivery, pickup, staged, returned, due, kpis] = await Promise.all([
    getDeliveryQueue(),
    getPickupQueue(),
    getStagedQueue(),
    getReturnedStillBilling(),
    getDueInvoiceQueue(),
    getFleetKpis(),
  ]);
  console.log("delivery queue:", delivery.length);
  console.log(
    "pickup queue:",
    pickup.length,
    "(billing-ended:",
    pickup.filter((p) => p.reason === "billing-ended").length + ")"
  );
  console.log("staged (on site, not billing):", staged.length);
  console.log("returned, still billing:", returned.length);
  console.log(
    "due to raise:",
    due.length,
    "(activations:",
    due.filter((d) => d.activates).length + ")"
  );
  const { inMaintenance, inInspection, ...k } = kpis;
  console.log("fleet kpis:", k, "inspection list:", inInspection.length, "maint:", inMaintenance.length);

  // Status vs deployment consistency.
  const trailers = await prisma.trailer.findMany({
    select: {
      unitNumber: true,
      status: true,
      deployments: {
        where: { returnedAt: null },
        select: { deliveredAt: true },
      },
    },
  });
  const bad = trailers.filter((t) => {
    const open = t.deployments[0];
    if (t.deployments.length > 1) return true;
    if (t.status === "DEPLOYED") return !open || !open.deliveredAt;
    if (t.status === "ASSIGNED") return !open || !!open.deliveredAt;
    return !!open;
  });
  console.log("inconsistent trailers:", bad.length, bad.slice(0, 5));
}

main().finally(() => prisma.$disconnect());
