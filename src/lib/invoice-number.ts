import { prisma } from "@/lib/prisma";

/* Invoice numbers are ours now, not Stripe's. Same shape as quotes
   (Q-2026-0001) so the two read as one system: INV-2026-0001.

   Counting rows would reuse a number after a deletion, so this takes the
   highest number actually issued this year and adds one. Wrapped in a
   transaction with the insert by the caller — a unique index on Invoice.number
   is the real guard, and a retry on collision is cheaper than a lock. */
export async function nextInvoiceNumber(year?: number): Promise<string> {
  const y = year ?? new Date().getFullYear();
  const prefix = `INV-${y}-`;
  const latest = await prisma.invoice.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const seq = latest ? parseInt(latest.number.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

/** Create with a number, retrying once past a concurrent insert that took it. */
export async function withInvoiceNumber<T>(
  create: (number: string) => Promise<T>,
  attempts = 3
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await create(await nextInvoiceNumber());
    } catch (err) {
      // P2002 = unique violation: someone else claimed the number. Try again.
      const code = (err as { code?: string }).code;
      if (code !== "P2002") throw err;
      lastError = err;
    }
  }
  throw lastError;
}
