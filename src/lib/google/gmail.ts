import { gmail as gmailApi } from "@googleapis/gmail";
import {
  GOOGLE_SCOPES,
  getGoogleClient,
  isGoogleConfigured,
  toPrimaryAddress,
  tryGoogle,
} from "./client";
import { toSendAsAddress } from "./identity";

/* Gmail send/read as a Workspace user via domain-wide delegation.

   bigview.ai is a domain alias of jetstreamsys.com, so we impersonate the
   PRIMARY address (the real mailbox) but set From: to the bigview.ai alias so
   customers see the brand. If that alias isn't verified for the mailbox we
   fall back to the primary address rather than failing the send. */

export function isGmailConfigured(): boolean {
  return isGoogleConfigured();
}

function client(userEmail: string, scopes: readonly string[]) {
  const auth = getGoogleClient(userEmail, scopes);
  if (!auth) return null;
  return gmailApi({ version: "v1", auth });
}

// Cache the resolved From address per mailbox — sendAs settings rarely change
// and this saves a round-trip on every send.
const sendAsCache = new Map<string, string>();

async function resolveFromAddress(
  userEmail: string,
  displayName: string
): Promise<string> {
  const primary = toPrimaryAddress(userEmail);
  const desired = toSendAsAddress(primary);
  const cached = sendAsCache.get(primary);
  if (cached) return formatAddress(displayName, cached);

  const resolved = await tryGoogle("gmail.sendAs", async () => {
    const api = client(primary, [
      ...GOOGLE_SCOPES.gmailSend,
      ...GOOGLE_SCOPES.gmailSettings,
    ]);
    if (!api) return null;
    const list = await api.users.settings.sendAs.list({ userId: "me" });
    const match = list.data.sendAs?.find(
      (s) => s.sendAsEmail?.toLowerCase() === desired
    );
    // Aliases created by a domain alias are usually auto-verified; only use
    // it if Gmail agrees, otherwise mail would bounce or be rejected.
    return match && match.verificationStatus !== "pending" ? desired : null;
  });

  const from = resolved ?? primary;
  sendAsCache.set(primary, from);
  return formatAddress(displayName, from);
}

function formatAddress(name: string, email: string) {
  // Encode non-ASCII display names per RFC 2047 so headers stay valid.
  const safe = /^[\x20-\x7E]*$/.test(name)
    ? name.replace(/"/g, "")
    : `=?UTF-8?B?${Buffer.from(name).toString("base64")}?=`;
  return name ? `"${safe}" <${email}>` : email;
}

function base64Url(input: string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Minimal HTML→text so the plain-text part stays readable. */
function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function buildMime(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
  inReplyTo?: string | null;
  references?: string | null;
}) {
  const boundary = `bv_${Date.now().toString(36)}`;
  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    opts.inReplyTo ? `In-Reply-To: ${opts.inReplyTo}` : null,
    opts.references ? `References: ${opts.references}` : null,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);

  return [
    headers.join("\r\n"),
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    htmlToText(opts.html),
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    opts.html,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

export type SentEmail = {
  messageId: string;
  threadId: string;
  fromAddress: string;
};

/**
 * Send mail as `sender`. Returns null when Gmail isn't configured or the send
 * fails, so callers can fall back to logging the content locally.
 */
export async function sendEmailAs(opts: {
  senderEmail: string;
  senderName: string;
  to: string;
  subject: string;
  html: string;
  /** Gmail thread to reply within, keeping the conversation together. */
  threadId?: string | null;
}): Promise<SentEmail | null> {
  if (!isGoogleConfigured()) return null;

  const primary = toPrimaryAddress(opts.senderEmail);
  const from = await resolveFromAddress(primary, opts.senderName);

  return tryGoogle("gmail.send", async () => {
    const api = client(primary, GOOGLE_SCOPES.gmailSend);
    if (!api) return null;

    const raw = base64Url(
      buildMime({
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      })
    );

    const sent = await api.users.messages.send({
      userId: "me",
      requestBody: {
        raw,
        ...(opts.threadId ? { threadId: opts.threadId } : {}),
      },
    });

    if (!sent.data.id || !sent.data.threadId) return null;
    return {
      messageId: sent.data.id,
      threadId: sent.data.threadId,
      fromAddress: from.replace(/^.*<|>$/g, ""),
    };
  });
}

// ---------- Inbound reading (used by the Pub/Sub push handler) ----------

export type FetchedMessage = {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  receivedAt: Date;
};

function decodePart(data?: string | null) {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64")
    .toString("utf8");
}

type GmailPart = {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: GmailPart[];
};

/** Prefer text/plain, fall back to stripped HTML. */
function extractBody(payload: GmailPart | undefined): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodePart(payload.body.data);
  }
  if (payload.parts?.length) {
    for (const part of payload.parts) {
      const found = extractBody(part);
      if (found) return found;
    }
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return htmlToText(decodePart(payload.body.data));
  }
  if (payload.body?.data) return decodePart(payload.body.data);
  return "";
}

export async function fetchMessage(
  mailbox: string,
  messageId: string
): Promise<FetchedMessage | null> {
  return tryGoogle("gmail.get", async () => {
    const api = client(mailbox, GOOGLE_SCOPES.gmailRead);
    if (!api) return null;
    const res = await api.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });
    const msg = res.data;
    if (!msg.id || !msg.threadId) return null;

    const headers = msg.payload?.headers ?? [];
    const header = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name)?.value ?? "";

    return {
      id: msg.id,
      threadId: msg.threadId,
      from: header("from"),
      to: header("to"),
      subject: header("subject"),
      body: extractBody(msg.payload as GmailPart | undefined),
      receivedAt: msg.internalDate
        ? new Date(Number(msg.internalDate))
        : new Date(),
    };
  });
}

/** Message ids added to a mailbox since `startHistoryId`. */
export async function listAddedMessageIds(
  mailbox: string,
  startHistoryId: string
): Promise<{ ids: string[]; latestHistoryId: string | null } | null> {
  return tryGoogle("gmail.history", async () => {
    const api = client(mailbox, GOOGLE_SCOPES.gmailRead);
    if (!api) return null;

    const ids = new Set<string>();
    let pageToken: string | undefined;
    let latestHistoryId: string | null = null;

    do {
      const res = await api.users.history.list({
        userId: "me",
        startHistoryId,
        historyTypes: ["messageAdded"],
        pageToken,
      });
      for (const h of res.data.history ?? []) {
        for (const added of h.messagesAdded ?? []) {
          const id = added.message?.id;
          // Skip our own sent copies — we already recorded those.
          const labels = added.message?.labelIds ?? [];
          if (id && !labels.includes("SENT")) ids.add(id);
        }
      }
      latestHistoryId = res.data.historyId ?? latestHistoryId;
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    return { ids: [...ids], latestHistoryId };
  });
}

/**
 * Start/refresh a Gmail push watch. Gmail watches expire after ~7 days, so
 * this must be re-called periodically; returns the new expiration.
 */
export async function watchMailbox(
  mailbox: string
): Promise<{ historyId: string | null; expiration: Date | null } | null> {
  const topic = process.env.GOOGLE_PUBSUB_TOPIC;
  if (!topic || !isGoogleConfigured()) return null;

  return tryGoogle("gmail.watch", async () => {
    const api = client(mailbox, GOOGLE_SCOPES.gmailRead);
    if (!api) return null;
    const res = await api.users.watch({
      userId: "me",
      requestBody: { topicName: topic, labelIds: ["INBOX"] },
    });
    return {
      historyId: res.data.historyId ?? null,
      expiration: res.data.expiration
        ? new Date(Number(res.data.expiration))
        : null,
    };
  });
}
