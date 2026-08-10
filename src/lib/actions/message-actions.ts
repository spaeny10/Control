"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./company-actions";

// Chatter parent: exactly one of these FK fields is set per message.
export type ChatterParent = {
  leadId?: string;
  quoteId?: string;
  subscriptionId?: string;
  companyId?: string;
  trailerId?: string;
  projectId?: string;
};

const noteSchema = z.object({
  body: z.string().min(1, "Note cannot be empty"),
});

export async function addNote(
  parent: ChatterParent,
  revalidate: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = noteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  await prisma.message.create({
    data: {
      channel: "NOTE",
      body: parsed.data.body,
      authorId: session.user.id,
      ...parent,
    },
  });

  revalidatePath(revalidate);
  return { ok: true };
}
