"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const companySchema = z.object({
  name: z.string().min(1, "Name is required"),
  billingStreet: z.string().optional(),
  billingCity: z.string().optional(),
  billingState: z.string().optional(),
  billingZip: z.string().optional(),
  website: z.string().optional(),
  notes: z.string().optional(),
});

export type ActionResult = { ok: boolean; error?: string; id?: string };

export async function createCompany(
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = companySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const company = await prisma.company.create({ data: parsed.data });
  revalidatePath("/companies");
  return { ok: true, id: company.id };
}

export async function updateCompany(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = companySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  await prisma.company.update({ where: { id }, data: parsed.data });
  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
  return { ok: true, id };
}

export async function deleteCompany(id: string): Promise<void> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return;

  await prisma.company.delete({ where: { id } });
  revalidatePath("/companies");
  redirect("/companies");
}
