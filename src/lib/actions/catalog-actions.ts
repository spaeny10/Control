"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./company-actions";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  /* TaxCloud Taxability Information Code. Rent, delivery, and setup labour are
     taxed differently by state, so it belongs per product. Null means
     unclassified — the catalog flags it, and billing falls back to 0 (general
     tangible personal property) rather than skipping tax. */
  tic: z.number().int().min(0).optional().nullable(),
  // One entry per offered cycle; at least one price required.
  prices: z
    .array(
      z.object({
        cycle: z.enum([
          "ONE_TIME",
          "DAILY",
          "WEEKLY",
          "EVERY_28_DAYS",
          "MONTHLY",
        ]),
        unitPrice: z.number().min(0),
      })
    )
    .min(1, "Set at least one price"),
});

export type ProductInput = z.infer<typeof productSchema>;

export async function createProduct(
  input: ProductInput
): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN")
    return { ok: false, error: "Admin only" };

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  await prisma.planProduct.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description || undefined,
      tic: parsed.data.tic ?? undefined,
      prices: { create: parsed.data.prices },
    },
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateProduct(
  id: string,
  input: ProductInput
): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN")
    return { ok: false, error: "Admin only" };

  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  // Replace the price set wholesale — removed cycles disappear from the
  // picker; existing quote lines keep their captured price.
  await prisma.$transaction([
    prisma.productPrice.deleteMany({ where: { planProductId: id } }),
    prisma.planProduct.update({
      where: { id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description || null,
        tic: parsed.data.tic ?? null,
        prices: { create: parsed.data.prices },
      },
    }),
  ]);
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
