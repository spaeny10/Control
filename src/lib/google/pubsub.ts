import { OAuth2Client } from "google-auth-library";

/* Verification for Google Pub/Sub push requests.

   The push endpoint is publicly reachable (it lives under /api/webhooks,
   which src/proxy.ts excludes from auth), so it must prove the caller is
   Google — the same discipline the Stripe webhook applies with its signature
   check, just with an OIDC token instead. */

const client = new OAuth2Client();

export type PushVerification =
  | { ok: true }
  | { ok: false; reason: string; configured: boolean };

export async function verifyPubSubPush(
  req: Request
): Promise<PushVerification> {
  const audience = process.env.GOOGLE_PUBSUB_PUSH_AUDIENCE;
  const expectedServiceAccount = process.env.GOOGLE_PUBSUB_PUSH_SA;
  if (!audience || !expectedServiceAccount) {
    return { ok: false, reason: "not-configured", configured: false };
  }

  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return { ok: false, reason: "missing-token", configured: true };
  }

  try {
    // Signature + expiry + audience are all enforced here. The audience check
    // prevents a token minted for another service being replayed at us.
    const ticket = await client.verifyIdToken({
      idToken: header.slice(7),
      audience,
    });
    const payload = ticket.getPayload();

    if (
      payload?.iss !== "https://accounts.google.com" &&
      payload?.iss !== "accounts.google.com"
    ) {
      return { ok: false, reason: "bad-issuer", configured: true };
    }
    // The audience is guessable from our URL, so also pin the exact identity
    // Pub/Sub was configured to push as.
    if (payload.email !== expectedServiceAccount) {
      return { ok: false, reason: "unexpected-service-account", configured: true };
    }
    if (payload.email_verified !== true) {
      return { ok: false, reason: "unverified-service-account", configured: true };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "invalid-token", configured: true };
  }
}

export type GmailNotification = {
  emailAddress: string;
  historyId: string;
};

/** Decode the Pub/Sub envelope. Returns null when it isn't usable. */
export function decodeGmailNotification(
  body: unknown
): GmailNotification | null {
  const envelope = body as { message?: { data?: string } } | null;
  const raw = envelope?.message?.data;
  if (!raw) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(raw, "base64").toString("utf8")
    ) as { emailAddress?: string; historyId?: string | number };
    if (!decoded.emailAddress || decoded.historyId === undefined) return null;
    return {
      emailAddress: decoded.emailAddress.toLowerCase().trim(),
      // historyId is a uint64 — keep it a string and compare with BigInt.
      historyId: String(decoded.historyId),
    };
  } catch {
    return null;
  }
}
