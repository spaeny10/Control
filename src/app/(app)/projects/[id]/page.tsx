import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getUserAreas } from "@/lib/authz";

/* The Projects area was retired: a job you're chasing is a project-track lead,
   a job you're on is a subscription, and a standalone Project page showed the
   same rows a third time. The route survives only to forward old links —
   there are a dozen across the app plus any Gmail thread anchored on a
   project — so nothing 404s.

   Destination is area-aware: sending a Sales-only rep to /subscriptions would
   just bounce them off the Accounting guard. */
export default async function ProjectRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, { isAdmin, areas }] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      select: {
        companyId: true,
        subscriptions: {
          orderBy: [{ endedAt: "asc" }, { startDate: "desc" }],
          select: { id: true },
          take: 1,
        },
        leads: {
          orderBy: { createdAt: "desc" },
          select: { id: true },
          take: 1,
        },
      },
    }),
    getUserAreas(),
  ]);

  if (!project) redirect("/");

  const can = (area: "SALES" | "ACCOUNTING") => isAdmin || areas.includes(area);
  const subscriptionId = project.subscriptions[0]?.id;
  const leadId = project.leads[0]?.id;

  // On the job → the subscription is the operational record. Still chasing it,
  // or the viewer can't see billing → the lead.
  if (subscriptionId && can("ACCOUNTING")) redirect(`/subscriptions/${subscriptionId}`);
  if (leadId && can("SALES")) redirect(`/leads/${leadId}`);
  if (can("SALES")) redirect(`/companies/${project.companyId}`);
  if (subscriptionId) redirect(`/subscriptions/${subscriptionId}`);
  redirect("/");
}
