"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "./company-actions";
import {
  syncActivityEvent,
  deleteActivityEvent,
} from "@/lib/google/calendar";

export type ActivityParent = {
  leadId?: string;
  companyId?: string;
  projectId?: string;
  subscriptionId?: string;
};

const activitySchema = z.object({
  type: z.enum(["CALL", "EMAIL", "MEETING", "TASK", "SITE_VISIT"]),
  title: z.string().min(1, "Title is required"),
  dueDate: z.string().min(1, "Due date is required"),
  assigneeId: z.string().optional(),
  notes: z.string().optional(),
});

export async function scheduleActivity(
  parent: ActivityParent,
  revalidate: string,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const parsed = activitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;

  const activity = await prisma.activity.create({
    data: {
      type: d.type,
      title: d.title,
      dueDate: new Date(d.dueDate),
      assigneeId: d.assigneeId || session.user.id,
      notes: d.notes || undefined,
      ...parent,
    },
  });

  // Put it on the assignee's Google Calendar (failure-isolated).
  await syncActivityEvent(activity.id);

  revalidatePath(revalidate);
  revalidatePath("/");
  return { ok: true };
}

export async function completeActivity(id: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  const activity = await prisma.activity.findUnique({ where: { id } });
  if (!activity) return { ok: false, error: "Activity not found" };
  if (activity.done) return { ok: true };

  await prisma.$transaction([
    prisma.activity.update({
      where: { id },
      data: { done: true, completedAt: new Date() },
    }),
    // Completion becomes part of the record's history.
    prisma.message.create({
      data: {
        channel: "SYSTEM",
        body: `Activity done: ${activity.type.replace("_", " ").toLowerCase()} — ${activity.title}`,
        authorId: session.user.id,
        leadId: activity.leadId,
        companyId: activity.companyId,
        projectId: activity.projectId,
        subscriptionId: activity.subscriptionId,
      },
    }),
  ]);

  // Completed activities come off the calendar.
  await syncActivityEvent(id);

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteActivity(id: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };

  // Remove the event before the row disappears (hard delete).
  await deleteActivityEvent(id);

  await prisma.activity.delete({ where: { id } });
  revalidatePath("/", "layout");
  return { ok: true };
}
