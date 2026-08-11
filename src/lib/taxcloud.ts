/* TaxCloud v3 client.

   Sales tax on rental equipment is sourced to where the equipment sits, so every
   call sends the jobsite as `destination`. Mirrors the getStripe() pattern: when
   unconfigured everything returns null and callers bill without tax rather than
   failing, so local dev and an un-keyed deploy both keep working.

   Deliberately NOT wired into billing yet — the caller side needs decisions
   about TIC codes per product and registered states. See the roadmap.

   Endpoints (verified against docs.taxcloud.com, v3):
     POST /tax/connections/{connectionId}/carts         → rate + amount per line
     POST /tax/connections/{connectionId}/carts/orders  → commit for filing
*/

const BASE = "https://api.v3.taxcloud.com";

export type TaxAddress = {
  line1: string;
  city: string;
  state: string;
  zip: string;
};

export type TaxLineItemInput = {
  /** Stable id we can match the returned tax back onto (e.g. a quote line id). */
  itemId: string;
  price: number;
  quantity: number;
  /** Taxability Information Code. 0 covers most tangible personal property;
      equipment rental and delivery/setup fees have their own codes, which is
      how "is this taxable, and on what basis" gets encoded. */
  tic: number;
};

export type TaxLineItemResult = {
  itemId: string;
  rate: number;
  amount: number;
};

export type TaxQuote = {
  cartId: string;
  lineItems: TaxLineItemResult[];
  totalTax: number;
};

type Config = { apiKey: string; connectionId: string; origin: TaxAddress };

/** Null when TaxCloud isn't configured, so billing degrades to no-tax rather
    than breaking. The origin is our own nexus address — TaxCloud needs both
    ends of the transaction, and we have nowhere else to keep it. */
export function getTaxCloudConfig(): Config | null {
  const apiKey = process.env.TAXCLOUD_API_KEY;
  const connectionId = process.env.TAXCLOUD_CONNECTION_ID;
  const line1 = process.env.TAXCLOUD_ORIGIN_STREET;
  const city = process.env.TAXCLOUD_ORIGIN_CITY;
  const state = process.env.TAXCLOUD_ORIGIN_STATE;
  const zip = process.env.TAXCLOUD_ORIGIN_ZIP;
  if (!apiKey || !connectionId || !line1 || !city || !state || !zip) return null;
  return { apiKey, connectionId, origin: { line1, city, state, zip } };
}

export function isTaxCloudConfigured(): boolean {
  return getTaxCloudConfig() !== null;
}

async function call<T>(
  cfg: Config,
  path: string,
  body: unknown,
  method: "POST" | "PATCH" = "POST"
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        "X-API-KEY": cfg.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      // Never cache a tax calculation.
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: `TaxCloud ${res.status}${text ? `: ${text.slice(0, 300)}` : ""}`,
      };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "TaxCloud request failed",
    };
  }
}

type CartResponse = {
  items?: {
    cartId?: string;
    lineItems?: {
      itemId?: string;
      tax?: { rate?: number; amount?: number };
    }[];
  }[];
};

/** Calculate tax for one destination. Returns null when unconfigured; an error
    string when TaxCloud rejected it — callers decide whether that blocks
    billing or bills untaxed with a flag. */
export async function calculateTax(input: {
  destination: TaxAddress;
  lineItems: TaxLineItemInput[];
  /** Our customer reference, so TaxCloud can attach exemption certificates. */
  customerId: string;
}): Promise<
  { ok: true; quote: TaxQuote } | { ok: false; error: string } | null
> {
  const cfg = getTaxCloudConfig();
  if (!cfg) return null;
  if (input.lineItems.length === 0) {
    return { ok: false, error: "No line items to tax" };
  }

  const result = await call<CartResponse>(
    cfg,
    `/tax/connections/${cfg.connectionId}/carts`,
    {
      items: [
        {
          currency: { currencyCode: "USD" },
          customerId: input.customerId,
          destination: input.destination,
          origin: cfg.origin,
          lineItems: input.lineItems.map((li, index) => ({
            index,
            itemId: li.itemId,
            price: li.price,
            quantity: li.quantity,
            tic: li.tic,
          })),
        },
      ],
    }
  );
  if (!result.ok) return result;

  const cart = result.data.items?.[0];
  if (!cart?.cartId) {
    return { ok: false, error: "TaxCloud returned no cart" };
  }
  const lineItems: TaxLineItemResult[] = (cart.lineItems ?? []).map((li) => ({
    itemId: li.itemId ?? "",
    rate: li.tax?.rate ?? 0,
    amount: li.tax?.amount ?? 0,
  }));
  return {
    ok: true,
    quote: {
      cartId: cart.cartId,
      lineItems,
      totalTax:
        Math.round(lineItems.reduce((s, li) => s + li.amount, 0) * 100) / 100,
    },
  };
}

/* Commit a calculated cart so TaxCloud can file it. Nothing is reported unless
   this runs with completed: true (or a completedDate is set later) — an
   uncommitted cart is a calculation, not a filed transaction.

   `completed: false` exists for cash-basis filing: create the order when the
   invoice goes out, then call markOrderCompleted when the check clears. Which
   basis applies is an accountant's call, not ours. */
export async function commitOrder(input: {
  /** Our own id — use the Stripe invoice id so it's traceable both ways. */
  orderId: string;
  cartId: string;
  completed: boolean;
}): Promise<{ ok: true } | { ok: false; error: string } | null> {
  const cfg = getTaxCloudConfig();
  if (!cfg) return null;
  const result = await call<unknown>(
    cfg,
    `/tax/connections/${cfg.connectionId}/carts/orders`,
    { orderId: input.orderId, cartId: input.cartId, completed: input.completed },
  );
  return result.ok ? { ok: true } : result;
}

/** Mark a deferred order complete — the cash-basis path, once payment lands. */
export async function markOrderCompleted(input: {
  orderId: string;
  completedDate: Date;
}): Promise<{ ok: true } | { ok: false; error: string } | null> {
  const cfg = getTaxCloudConfig();
  if (!cfg) return null;
  const result = await call<unknown>(
    cfg,
    `/tax/connections/${cfg.connectionId}/carts/orders`,
    {
      orderId: input.orderId,
      completedDate: input.completedDate.toISOString(),
    },
    "PATCH"
  );
  return result.ok ? { ok: true } : result;
}
