"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { armMailboxWatch, disarmMailboxWatch } from "@/lib/google/mailbox";
import type { ActionResult } from "./company-actions";

/* Admin controls for which mailboxes the app watches for inbound email.
   The lifecycle logic lives in @/lib/google/mailbox so user-management flows
   can reuse it. */

function reasonMessage(reason: string) {
  switch (reason) {
    case "not-configured":
      return "Google Workspace and the Pub/Sub topic must be configured first.";
    case "not-workspace":
      return "Must be a company Workspace address.";
    default:
      return "Google refused the watch. Check the service account, Pub/Sub topic, and domain-wide delegation scopes.";
  }
}

export async function startWatchingMailbox(
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN")
    return { ok: false, error: "Admin only" };

  const emailAddress = String(formData.get("emailAddress") ?? "").trim();
  if (!emailAddress) return { ok: false, error: "Mailbox address required" };

  const result = await armMailboxWatch(emailAddress);
  if (!result.armed) {
    return { ok: false, error: reasonMessage(result.reason) };
  }

  revalidatePath("/settings");
  return { ok: true };
}

export async function stopWatchingMailbox(id: string): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN")
    return { ok: false, error: "Admin only" };

  const mailbox = await prisma.gmailSyncState.findUnique({ where: { id } });
  if (!mailbox) return { ok: false, error: "Mailbox not found" };

  await disarmMailboxWatch(mailbox.emailAddress);
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Arm watches for every active user with Sales access in one go, so onboarding
 * nine existing reps isn't nine manual steps.
 */
export async function armWatchesForActiveReps(): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN")
    return { ok: false, error: "Admin only" };

  const users = await prisma.user.findMany({
    where: { isActive: true, OR: [{ role: "ADMIN" }, { areas: { has: "SALES" } }] },
    select: { email: true },
  });

  let armed = 0;
  const failures: string[] = [];
  for (const user of users) {
    const result = await armMailboxWatch(user.email);
    if (result.armed) armed++;
    else failures.push(user.email);
  }

  revalidatePath("/settings");
  if (armed === 0) {
    return {
      ok: false,
      error:
        users.length === 0
          ? "No active sales users to arm."
          : "Could not arm any mailboxes — check the Google configuration.",
    };
  }
  return {
    ok: true,
    // Report partial success honestly rather than implying all succeeded.
    error:
      failures.length > 0
        ? `Armed ${armed}; failed for ${failures.join(", ")}.`
        : undefined,
  };
}
