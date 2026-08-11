import { JWT } from "google-auth-library";
import { PRIMARY_DOMAIN } from "./identity";

/* Service account with domain-wide delegation.

   Every Google API call is made *as* a specific Workspace user by setting
   `subject` to their primary address — that's what domain-wide delegation
   buys us: no per-user OAuth connect flow and no refresh tokens to store.

   Mirrors the getStripe() pattern in src/lib/stripe.ts: returns null when
   unconfigured so every caller degrades to local-only behaviour instead of
   throwing. Google being unavailable must never block a local write. */

export const GOOGLE_SCOPES = {
  calendar: ["https://www.googleapis.com/auth/calendar.events"],
  // gmail.send cannot read; readonly is needed for history/threads on inbound.
  gmailSend: ["https://www.googleapis.com/auth/gmail.send"],
  gmailRead: ["https://www.googleapis.com/auth/gmail.readonly"],
  gmailSettings: ["https://www.googleapis.com/auth/gmail.settings.basic"],
  // drive.file limits us to files this app created — deliberately narrower
  // than full Drive access.
  drive: ["https://www.googleapis.com/auth/drive.file"],
} as const;

type ServiceAccountKey = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

let cachedKey: ServiceAccountKey | null | undefined;

function loadKey(): ServiceAccountKey | null {
  if (cachedKey !== undefined) return cachedKey;

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    cachedKey = null;
    return null;
  }
  try {
    // Accept either raw JSON or base64-encoded JSON (base64 avoids newline
    // mangling in env vars, which is the usual failure mode).
    const json = raw.trim().startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json) as ServiceAccountKey;
    if (!parsed.client_email || !parsed.private_key) {
      console.error("GOOGLE_SERVICE_ACCOUNT_KEY is missing required fields");
      cachedKey = null;
      return null;
    }
    cachedKey = parsed;
    return cachedKey;
  } catch (err) {
    console.error("GOOGLE_SERVICE_ACCOUNT_KEY could not be parsed", err);
    cachedKey = null;
    return null;
  }
}

export function isGoogleConfigured(): boolean {
  return loadKey() !== null;
}

// One client per (subject, scope-set). JWT clients cache their access token
// internally, so reusing them avoids a token round-trip per call.
const clients = new Map<string, JWT>();

/**
 * An authenticated client acting as `userEmail`. Returns null when Google
 * isn't configured — callers must handle that rather than assume success.
 */
export function getGoogleClient(
  userEmail: string,
  scopes: readonly string[]
): JWT | null {
  const key = loadKey();
  if (!key) return null;

  // Impersonation subject must be a real mailbox: with bigview.ai as a domain
  // alias, the canonical address is on the primary domain.
  const subject = toPrimaryAddress(userEmail);
  const cacheKey = `${subject}|${[...scopes].sort().join(",")}`;

  const existing = clients.get(cacheKey);
  if (existing) return existing;

  const client = new JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: [...scopes],
    subject,
  });
  clients.set(cacheKey, client);
  return client;
}

/** Map any address for a person to their primary-domain address. */
export function toPrimaryAddress(email: string): string {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at < 0) return normalized;
  return `${normalized.slice(0, at)}@${PRIMARY_DOMAIN}`;
}

/**
 * Run a Google call without letting failures escape. Google is a secondary
 * system: a calendar or mail error must never roll back the local write that
 * triggered it. Returns null on failure and logs for diagnosis.
 */
export async function tryGoogle<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[google:${label}] ${message}`);
    return null;
  }
}
