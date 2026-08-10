"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./company-actions";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  kind: z.enum(["RECURRING_MONTHLY", "ONE_TIME"]),
  unitPrice: z.string().min(1, "Price is required"),
  description: z.string().optional(),
});

export async function createProduct(
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN")
    return { ok: false, error: "Admin only" };

  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  await prisma.planProduct.create({
    data: {
      name: parsed.data.name,
      kind: parsed.data.kind,
      unitPrice: parseFloat(parsed.data.unitPrice),
      description: parsed.data.description || undefined,
    },
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateProduct(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN")
    return { ok: false, error: "Admin only" };

  const parsed = productSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  // Price changes shouldn't silently reuse a stale Stripe price — clear the
  // cached product mapping so the next conversion recreates it.
  await prisma.planProduct.update({
    where: { id },
    data: {
      name: parsed.data.name,
      kind: parsed.data.kind,
      unitPrice: parseFloat(parsed.data.unitPrice),
      description: parsed.data.description || null,
      stripePriceId: null,
    },
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function setProductActive(
  id: string,
  isActive: boolean
): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN")
    return { ok: false, error: "Admin only" };

  await prisma.planProduct.update({ where: { id }, data: { isActive } });
  revalidatePath("/settings");
  return { ok: true };
}
