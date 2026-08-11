import { prisma } from "@/lib/prisma";

type ChatterParentKey =
  | "leadId"
  | "quoteId"
  | "subscriptionId"
  | "companyId"
  | "projectId"
  | "trailerId";

type FieldLabel = {
  label: string;
  format?: (v: unknown) => string;
};

function defaultFormat(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (v instanceof Date) return v.toLocaleDateString("en-US");
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && "toNumber" in (v as Record<string, unknown>))
    return String((v as { toNumber: () => number }).toNumber());
  return String(v);
}

export function describeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: Record<string, FieldLabel>
): string[] {
  const lines: string[] = [];
  for (const [key, { label, format }] of Object.entries(fields)) {
    const oldVal = before[key];
    const newVal = after[key];
    const fmt = format ?? defaultFormat;
    const oldStr = fmt(oldVal);
    const newStr = fmt(newVal);
    if (oldStr !== newStr) {
      lines.push(`${label}: ${oldStr} → ${newStr}`);
    }
  }
  return lines;
}

export async function logChanges(opts: {
  parent: Partial<Record<ChatterParentKey, string>>;
  authorId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  fields: Record<string, FieldLabel>;
}): Promise<void> {
  const lines = describeChanges(opts.before, opts.after, opts.fields);
  if (lines.length === 0) return;

  await prisma.message.create({
    data: {
      channel: "SYSTEM",
      body: lines.join("\n"),
      authorId: opts.authorId,
      ...opts.parent,
    },
  });
}
