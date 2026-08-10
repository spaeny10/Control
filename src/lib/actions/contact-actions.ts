"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./company-actions";

// Normalize US phone input to E.164 so inbound SMS can be matched later.
function normalizePhone(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits;
}

const contactSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  title: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  notes: z.string().optional(),
  companyId: z.string().min(1, "Company is required"),
});

export async function createContact(
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { email, phone, ...rest } = parsed.data;
  const contact = await prisma.contact.create({
    data: {
      ...rest,
      email: email || undefined,
      phone: normalizePhone(phone),
    },
  });
  revalidatePath("/contacts");
  revalidatePath(`/companies/${contact.companyId}`);
  return { ok: true, id: contact.id };
}

export async function updateContact(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { email, phone, ...rest } = parsed.data;
  const contact = await prisma.contact.update({
    where: { id },
    data: {
      ...rest,
      email: email || null,
      phone: normalizePhone(phone) ?? null,
    },
  });
  revalidatePath("/contacts");
  revalidatePath(`/companies/${contact.companyId}`);
  return { ok: true, id };
}

export async function deleteContact(id: string): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN")
    return { ok: false, error: "Admin only" };

  await prisma.contact.delete({ where: { id } });
  revalidatePath("/contacts");
  return { ok: true };
}
