"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
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

  const project = await prisma.project.update({
    where: { id },
    data: toData(parsed.data),
  });
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  revalidatePath(`/companies/${project.companyId}`);
  return { ok: true, id };
}

export async function setProjectStatus(
  id: string,
  status: "UPCOMING" | "ACTIVE" | "COMPLETED"
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  await prisma.project.update({ where: { id }, data: { status } });
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return { ok: true };
}
