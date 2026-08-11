"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { watchMailbox } from "@/lib/google/gmail";
import { isWorkspaceEmail } from "@/lib/google/identity";
import type { ActionResult } from "./company-actions";

/* Admin controls for which mailboxes the app watches for inbound email.
   The GmailSyncState rows double as the impersonation allowlist, so adding a
   mailbox here is the deliberate act that grants the app access to it. */

export async function startWatchingMailbox(
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN")
    return { ok: false, error: "Admin only" };

  const emailAddress = String(formData.get("emailAddress") ?? "")
    .trim()
    .toLowerCase();
  if (!emailAddress) return { ok: false, error: "Mailbox address required" };
  if (!isWorkspaceEmail(emailAddress)) {
    return { ok: false, error: "Must be a company Workspace address" };
  }

  // Arm the Gmail watch first — if Google refuses, don't create a row that
  // claims we're watching a mailbox we aren't.
  const watch = await watchMailbox(emailAddress);
  if (!watch) {
    return {
      ok: false,
      error:
        "Google refused the watch. Check the service account, Pub/Sub topic, and domain-wide delegation scopes.",
    };
  }

  await prisma.gmailSyncState.upsert({
    where: { emailAddress },
    create: {
      emailAddress,
      isActive: true,
      // Start from now so we don't import the mailbox's whole history.
      lastHistoryId: watch.historyId,
      watchExpiration: watch.expiration,
    },
    update: {
      isActive: true,
      watchExpiration: watch.expiration,
      lastError: null,
    },
  });

  revalidatePath("/settings");
  return { ok: true };
}

export async function stopWatchingMailbox(id: string): Promise<ActionResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN")
    return { ok: false, error: "Admin only" };

  // Deactivate rather than delete so the historyId survives if it's re-enabled,
  // and so the allowlist check has an explicit "off" state.
  await prisma.gmailSyncState.update({
    where: { id },
    data: { isActive: false },
  });
  revalidatePath("/settings");
  return { ok: true };
}
