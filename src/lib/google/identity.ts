/* Identity helpers for the Workspace setup: primary domain jetstreamsys.com
   with bigview.ai as a DOMAIN ALIAS (same mailboxes, two addresses).

   Google returns a user's primary address on sign-in, but people may be
   referred to by either address, so user lookup must accept both. */

export const PRIMARY_DOMAIN =
  process.env.GOOGLE_WORKSPACE_PRIMARY_DOMAIN ?? "jetstreamsys.com";
export const SEND_AS_DOMAIN =
  process.env.GOOGLE_SEND_AS_DOMAIN ?? "bigview.ai";

function splitEmail(email: string) {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return { local: email.slice(0, at), domain: email.slice(at + 1) };
}

/** Every address that could refer to the same mailbox, lowercased. */
export function emailVariants(email: string): string[] {
  const normalized = email.trim().toLowerCase();
  const parts = splitEmail(normalized);
  if (!parts) return [normalized];

  const domains = new Set([parts.domain]);
  if (parts.domain === PRIMARY_DOMAIN) domains.add(SEND_AS_DOMAIN);
  if (parts.domain === SEND_AS_DOMAIN) domains.add(PRIMARY_DOMAIN);

  return [...domains].map((d) => `${parts.local}@${d}`);
}

/** True when the address belongs to our Workspace (either domain). */
export function isWorkspaceEmail(email: string): boolean {
  const parts = splitEmail(email.trim().toLowerCase());
  if (!parts) return false;
  return parts.domain === PRIMARY_DOMAIN || parts.domain === SEND_AS_DOMAIN;
}

/** The branded address to send mail as, given any address for that person. */
export function toSendAsAddress(email: string): string {
  const parts = splitEmail(email.trim().toLowerCase());
  if (!parts) return email;
  return `${parts.local}@${SEND_AS_DOMAIN}`;
}
