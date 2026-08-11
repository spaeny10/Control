"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./company-actions";
import { armMailboxWatch, disarmMailboxWatch } from "@/lib/google/mailbox";

const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters");

export async function changePassword(
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  const parsed = passwordSchema.safeParse(next);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (next !== confirm) return { ok: false, error: "Passwords do not match" };

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) return { ok: false, error: "User not found" };
  // SSO-only accounts have no local password to change.
  if (!user.passwordHash) {
    return {
      ok: false,
      error:
        "This account signs in with Google — manage the password in your Google account.",
    };
  }

  const valid = await bcrypt.compare(current, user.passwordHash);
  if (!valid) return { ok: false, error: "Current password is incorrect" };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next, 10) },
  });
  return { ok: true };
}

const userSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  role: z.enum(["ADMIN", "MEMBER"]),
  password: z.string().optional(),
});

const AREA_VALUES = ["SALES", "FLEET", "ACCOUNTING", "TECH_ADMIN"] as const;

function parseAreas(formData: FormData) {
  return formData
    .getAll("areas")
    .map(String)
    .filter((a): a is (typeof AREA_VALUES)[number] =>
      (AREA_VALUES as readonly string[]).includes(a)
    );
}

export async function createUser(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN")
    return { ok: false, error: "Admin only" };

  const parsed = userSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;

  if (!d.password || d.password.length < 10) {
    return { ok: false, error: "Temporary password must be at least 10 characters" };
  }

  const email = d.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { ok: false, error: "A user with that email exists" };

  await prisma.user.create({
    data: {
      name: d.name,
      email,
      role: d.role,
      areas: parseAreas(formData),
      passwordHash: await bcrypt.hash(d.password, 10),
    },
  });

  // Arm their mailbox watch so inbound customer replies work from day one.
  // Deliberately ignores the result: onboarding must not fail because Gmail
  // is unconfigured or unavailable, and Settings surfaces watch health.
  await armMailboxWatch(email);

  revalidatePath("/settings");
  return { ok: true };
}

export async function updateUser(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN")
    return { ok: false, error: "Admin only" };

  const parsed = userSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;

  // Guard: never demote or deactivate the last active admin.
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return { ok: false, error: "User not found" };
  if (target.role === "ADMIN" && d.role !== "ADMIN") {
    const adminCount = await prisma.user.count({
      where: { role: "ADMIN", isActive: true },
    });
    if (adminCount <= 1)
      return { ok: false, error: "Cannot demote the last admin" };
  }

  const nextEmail = d.email.toLowerCase().trim();
  await prisma.user.update({
    where: { id },
    data: {
      name: d.name,
      email: nextEmail,
      role: d.role,
      areas: parseAreas(formData),
      ...(d.password && d.password.length >= 10
        ? { passwordHash: await bcrypt.hash(d.password, 10) }
        : {}),
    },
  });

  // If their address changed, move the watch with them — otherwise it would
  // keep pointing at a mailbox that's no longer theirs.
  if (nextEmail !== target.email) {
    await disarmMailboxWatch(target.email);
    if (target.isActive) await armMailboxWatch(nextEmail);
  }

  revalidatePath("/settings");
  return { ok: true };
}

export async function setUserActive(
  id: string,
  isActive: boolean
): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN")
    return { ok: false, error: "Admin only" };
  if (id === session.user.id)
    return { ok: false, error: "You cannot deactivate yourself" };

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return { ok: false, error: "User not found" };
  if (!isActive && target.role === "ADMIN") {
    const adminCount = await prisma.user.count({
      where: { role: "ADMIN", isActive: true },
    });
    if (adminCount <= 1)
      return { ok: false, error: "Cannot deactivate the last admin" };
  }

  await prisma.user.update({ where: { id }, data: { isActive } });

  // Watch lifecycle follows user lifecycle: a departing rep's mailbox stops
  // being read, and a returning one starts again. Their existing customer
  // threads stay on the records either way, and any awaiting a reply surface
  // on the dashboard as unanswered.
  if (isActive) await armMailboxWatch(target.email);
  else await disarmMailboxWatch(target.email);

  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}
