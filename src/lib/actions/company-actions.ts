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
  parentCompanyId: z.string().optional(),
});

// Branches are one level deep: a parent can't become a branch, and a branch
// can't be a parent.
async function validateParent(
  parentCompanyId: string | undefined,
  selfId?: string
): Promise<string | null> {
  if (!parentCompanyId) return null;
  if (parentCompanyId === selfId) return "A company cannot be its own branch";
  const parent = await prisma.company.findUnique({
    where: { id: parentCompanyId },
    select: { parentCompanyId: true },
  });
  if (!parent) return "Parent company not found";
  if (parent.parentCompanyId)
    return "Cannot nest branches — the selected parent is itself a branch";
  if (selfId) {
    const hasBranches = await prisma.company.count({
      where: { parentCompanyId: selfId },
    });
    if (hasBranches > 0)
      return "This company has branches and cannot become a branch itself";
  }
  return null;
}

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

  const { parentCompanyId, ...rest } = parsed.data;
  const parentError = await validateParent(parentCompanyId || undefined);
  if (parentError) return { ok: false, error: parentError };

  const company = await prisma.company.create({
    data: { ...rest, parentCompanyId: parentCompanyId || undefined },
  });
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

  const { parentCompanyId, ...rest } = parsed.data;
  const parentError = await validateParent(parentCompanyId || undefined, id);
  if (parentError) return { ok: false, error: parentError };

  await prisma.company.update({
    where: { id },
    data: { ...rest, parentCompanyId: parentCompanyId || null },
  });
  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
  return { ok: true, id };
}

// ---- Branch/company price overrides ----

export async function setCompanyPrice(
  companyId: string,
  planProductId: string,
  unitPrice: number
): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN")
    return { ok: false, error: "Admin only" };
  if (!(unitPrice >= 0)) return { ok: false, error: "Invalid price" };

  await prisma.companyPrice.upsert({
    where: { companyId_planProductId: { companyId, planProductId } },
    create: { companyId, planProductId, unitPrice },
    update: { unitPrice },
  });
  revalidatePath(`/companies/${companyId}`);
  return { ok: true };
}

export async function removeCompanyPrice(
  companyId: string,
  planProductId: string
): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN")
    return { ok: false, error: "Admin only" };

  await prisma.companyPrice.deleteMany({
    where: { companyId, planProductId },
  });
  revalidatePath(`/companies/${companyId}`);
  return { ok: true };
}

export async function deleteCompany(id: string): Promise<void> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return;

  await prisma.company.delete({ where: { id } });
  revalidatePath("/companies");
  redirect("/companies");
}
