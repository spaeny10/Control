import { prisma } from "@/lib/prisma";
import { watchMailbox } from "./gmail";
import { isGoogleConfigured } from "./client";
import { isWorkspaceEmail } from "./identity";

/* Mailbox watch lifecycle, kept out of the "use server" action file so it can
   be reused from other server actions (a "use server" module may only export
   async actions).

   The GmailSyncState rows double as the impersonation allowlist, so arming a
   watch is the deliberate act that grants the app access to that mailbox. */

export type ArmResult =
  | { armed: true }
  | { armed: false; reason: "not-configured" | "not-workspace" | "google-refused" };

/**
 * Start (or refresh) watching a mailbox for inbound customer replies.
 *
 * Never throws: this runs inside user-management flows, and creating a user
 * must not fail because Gmail did.
 */
export async function armMailboxWatch(
  emailAddress: string
): Promise<ArmResult> {
  const address = emailAddress.trim().toLowerCase();
  if (!isGoogleConfigured() || !process.env.GOOGLE_PUBSUB_TOPIC) {
    return { armed: false, reason: "not-configured" };
  }
  if (!isWorkspaceEmail(address)) {
    return { armed: false, reason: "not-workspace" };
  }

  try {
    // Arm the Google side first — don't record a row claiming we're watching
    // a mailbox we aren't.
    const watch = await watchMailbox(address);
    if (!watch) return { armed: false, reason: "google-refused" };

    await prisma.gmailSyncState.upsert({
      where: { emailAddress: address },
      create: {
        emailAddress: address,
        isActive: true,
        // Start from now rather than importing the mailbox's whole history.
        lastHistoryId: watch.historyId,
        watchExpiration: watch.expiration,
      },
      update: {
        isActive: true,
        watchExpiration: watch.expiration,
        lastError: null,
      },
    });
    return { armed: true };
  } catch (err) {
    console.error(`[mailbox.arm] ${address}`, err);
    return { armed: false, reason: "google-refused" };
  }
}

/**
 * Stop watching a mailbox. Deactivates rather than deletes so the history
 * watermark survives a re-hire, and so the allowlist has an explicit "off".
 */
export async function disarmMailboxWatch(emailAddress: string): Promise<void> {
  const address = emailAddress.trim().toLowerCase();
  try {
    await prisma.gmailSyncState.updateMany({
      where: { emailAddress: address },
      data: { isActive: false },
    });
  } catch (err) {
    console.error(`[mailbox.disarm] ${address}`, err);
  }
}

export type WatchHealth = "active" | "expired" | "paused" | "none";

/** Watch state per mailbox address, for showing health next to each user. */
export async function getWatchHealthByEmail(): Promise<
  Map<string, WatchHealth>
> {
  const rows = await prisma.gmailSyncState.findMany({
    select: { emailAddress: true, isActive: true, watchExpiration: true },
  });
  const now = new Date();
  const map = new Map<string, WatchHealth>();
  for (const row of rows) {
    map.set(
      row.emailAddress,
      !row.isActive
        ? "paused"
        : // A lapsed watch means Gmail stopped publishing silently — the
          // failure mode most worth surfacing.
          row.watchExpiration && row.watchExpiration < now
          ? "expired"
          : "active"
    );
  }
  return map;
}
