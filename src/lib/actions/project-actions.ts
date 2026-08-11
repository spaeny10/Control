"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { logChanges } from "@/lib/audit";
import type { ActionResult } from "./company-actions";

const projectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  companyId: z.string().min(1, "Company is required"),
  status: z.enum(["UPCOMING", "ACTIVE", "COMPLETED"]).default("UPCOMING"),
  siteStreet: z.string().optional(),
  siteCity: z.string().optional(),
  siteState: z.string().optional(),
  siteZip: z.string().optional(),
  expectedStart: z.string().optional(),
  expectedEnd: z.string().optional(),
  notes: z.string().optional(),
});

function toData(parsed: z.infer<typeof projectSchema>) {
  const { expectedStart, expectedEnd, ...rest } = parsed;
  return {
    ...rest,
    expectedStart: expectedStart ? new Date(expectedStart) : null,
    expectedEnd: expectedEnd ? new Date(expectedEnd) : null,
  };
}

export async function createProject(
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const project = await prisma.project.create({ data: toData(parsed.data) });
  revalidatePath("/projects");
  revalidatePath(`/companies/${project.companyId}`);
  return { ok: true, id: project.id };
}

export async function updateProject(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = projectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const before = await prisma.project.findUnique({
    where: { id },
    include: { company: { select: { name: true } } },
  });

  const project = await prisma.project.update({
    where: { id },
    data: toData(parsed.data),
    include: {
      company: { select: { name: true } },
      leads: { select: { id: true }, orderBy: { createdAt: "desc" } },
      subscriptions: {
        select: { id: true },
        orderBy: [{ endedAt: "asc" }, { startDate: "desc" }],
      },
    },
  });

  if (before) {
    /* Log where someone will actually read it. There's no Projects page any
       more, so a projectId-parented message would be invisible — attach it to
       the subscription if we're on site, otherwise the lead. */
    const auditParent =
      project.subscriptions[0]
        ? { subscriptionId: project.subscriptions[0].id }
        : project.leads[0]
          ? { leadId: project.leads[0].id }
          : { projectId: id };
    await logChanges({
      parent: auditParent,
      authorId: session.user.id,
      before: { ...before, companyName: before.company?.name ?? null },
      after: { ...project, companyName: project.company?.name ?? null },
      fields: {
        name: { label: "Name" },
        status: { label: "Status" },
        companyName: { label: "Company" },
        siteStreet: { label: "Site street" },
        siteCity: { label: "Site city" },
        siteState: { label: "Site state" },
        siteZip: { label: "Site ZIP" },
        expectedStart: {
          label: "Expected start",
          format: (v) => (v instanceof Date ? v.toLocaleDateString("en-US") : "—"),
        },
        expectedEnd: {
          label: "Expected end",
          format: (v) => (v instanceof Date ? v.toLocaleDateString("en-US") : "—"),
        },
        notes: { label: "Notes" },
      },
    });
  }

  /* The Projects pages are retired, so job data is edited from wherever it's
     shown: the lead while we're chasing it, the subscription once we're on
     site, plus dispatch and the dashboard, which forecast off expectedEnd. */
  revalidatePath("/leads");
  revalidatePath("/subscriptions");
  revalidatePath("/dispatch");
  revalidatePath("/");
  revalidatePath(`/companies/${project.companyId}`);
  for (const l of project.leads) revalidatePath(`/leads/${l.id}`);
  for (const s of project.subscriptions) revalidatePath(`/subscriptions/${s.id}`);
  return { ok: true, id };
}

export async function setProjectStatus(
  id: string,
  status: "UPCOMING" | "ACTIVE" | "COMPLETED"
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const before = await prisma.project.findUnique({
    where: { id },
    select: { status: true },
  });

  await prisma.project.update({ where: { id }, data: { status } });

  if (before && before.status !== status) {
    await logChanges({
      parent: { projectId: id },
      authorId: session.user.id,
      before: { status: before.status },
      after: { status },
      fields: { status: { label: "Status" } },
    });
  }

  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return { ok: true };
}
