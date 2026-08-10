"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./company-actions";

export async function createSalesTeam(
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN")
    return { ok: false, error: "Admin only" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Team name is required" };

  const existing = await prisma.salesTeam.findUnique({ where: { name } });
  if (existing) return { ok: false, error: "A team with that name exists" };

  await prisma.salesTeam.create({ data: { name } });
  revalidatePath("/settings");
  revalidatePath("/sales");
  return { ok: true };
}

export async function deleteSalesTeam(id: string): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN")
    return { ok: false, error: "Admin only" };

  // Members are detached (SetNull), not deleted.
  await prisma.salesTeam.delete({ where: { id } });
  revalidatePath("/settings");
  revalidatePath("/sales");
  return { ok: true };
}

export async function assignUserToTeam(
  userId: string,
  salesTeamId: string | null
): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN")
    return { ok: false, error: "Admin only" };

  await prisma.user.update({
    where: { id: userId },
    data: { salesTeamId },
  });
  revalidatePath("/settings");
  revalidatePath("/sales");
  return { ok: true };
}

const rateSchema = z.coerce.number().min(0).max(100);

export async function setCommissionRate(
  userId: string,
  rate: number
): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN")
    return { ok: false, error: "Admin only" };

  const parsed = rateSchema.safeParse(rate);
  if (!parsed.success)
    return { ok: false, error: "Rate must be between 0 and 100" };

  await prisma.user.update({
    where: { id: userId },
    data: { commissionRate: parsed.data },
  });
  revalidatePath("/settings");
  revalidatePath("/sales");
  return { ok: true };
}
