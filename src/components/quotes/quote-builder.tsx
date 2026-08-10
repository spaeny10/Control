"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createQuote,
  updateQuote,
  type QuoteInput,
} from "@/lib/actions/quote-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import {
  CYCLES,
  CYCLE_LABELS,
  CYCLE_SUFFIX,
  isRecurring,
  toMonthly,
} from "@/lib/cycles";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import type { BillingCycle } from "@prisma/client";

export type CatalogProduct = {
  id: string;
  name: string;
  description: string | null;
  prices: { cycle: BillingCycle; unitPrice: number }[];
};

export type BuilderLineItem = {
  key: string;
  cycle: BillingCycle;
  description: string;
  quantity: number;
  unitPrice: number;
  planProductId: string | null;
};

type Option = { id: string; name: string };
type ContactOption = Option & { companyId: string; isBillingContact?: boolean };
type ProjectOption = Option & { companyId: string };
type LeadOption = Option & { companyId: string | null; projectId: string | null };

export function QuoteBuilder({
  companies,
  contacts,
  projects,
  leads,
  catalog,
  priceOverrides = {},
  initial,
  quoteId,
}: {
  companies: Option[];
  contacts: ContactOption[];
  projects: ProjectOption[];
  leads: LeadOption[];
  catalog: CatalogProduct[];
  // { companyId: { "planProductId:cycle": negotiatedPrice } }
  priceOverrides?: Record<string, Record<string, number>>;
  initial?: {
    companyId: string;
    contactId: string | null;
    projectId: string | null;
    leadId: string | null;
    validUntil: string | null;
    terms: string | null;
    lineItems: Omit<BuilderLineItem, "key">[];
  };
  quoteId?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [companyId, setCompanyId] = useState(initial?.companyId ?? "");
  const [contactId, setContactId] = useState(initial?.contactId ?? "");
  const [projectId, setProjectId] = useState(initial?.projectId ?? "");
  const [leadId, setLeadId] = useState(initial?.leadId ?? "");
  const [validUntil, setValidUntil] = useState(initial?.validUntil ?? "");
  const [terms, setTerms] = useState(initial?.terms ?? "");
  const [items, setItems] = useState<BuilderLineItem[]>(
    initial?.lineItems.map((li, i) => ({ ...li, key: `init-${i}` })) ?? []
  );

  const companyContacts = useMemo(
    () => contacts.filter((c) => c.companyId === companyId),
    [contacts, companyId]
  );
  const companyProjects = useMemo(
    () => projects.filter((p) => p.companyId === companyId),
    [projects, companyId]
  );
  const companyLeads = useMemo(
    () => leads.filter((l) => !l.companyId || l.companyId === companyId),
    [leads, companyId]
  );

  // Every offered product x cycle combination for the picker.
  const catalogEntries = useMemo(
    () =>
      catalog.flatMap((p) =>
        p.prices.map((price) => ({
          value: `${p.id}:${price.cycle}`,
          product: p,
          cycle: price.cycle,
          listPrice: price.unitPrice,
        }))
      ),
    [catalog]
  );

  // Negotiated per-company price wins over the catalog default.
  function effectivePrice(
    productId: string,
    cycle: BillingCycle,
    listPrice: number
  ) {
    return priceOverrides[companyId]?.[`${productId}:${cycle}`] ?? listPrice;
  }

  const totals = useMemo(() => {
    const recurring: Partial<Record<BillingCycle, number>> = {};
    let oneTime = 0;
    let monthlyEquivalent = 0;
    let recurringFirstPeriod = 0;
    for (const item of items) {
      const amount = item.quantity * item.unitPrice;
      if (isRecurring(item.cycle)) {
        recurring[item.cycle] = (recurring[item.cycle] ?? 0) + amount;
        monthlyEquivalent += toMonthly(amount, item.cycle);
        recurringFirstPeriod += amount;
      } else {
        oneTime += amount;
      }
    }
    return {
      recurring,
      oneTime,
      monthlyEquivalent,
      firstInvoice: recurringFirstPeriod + oneTime,
    };
  }, [items]);

  const recurringCyclesUsed = Object.keys(totals.recurring) as BillingCycle[];
  const mixedCycles = recurringCyclesUsed.length > 1;

  function addFromCatalog(entryValue: string) {
    const entry = catalogEntries.find((e) => e.value === entryValue);
    if (!entry) return;
    setItems((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${prev.length}`,
        cycle: entry.cycle,
        description: entry.product.name,
        quantity: 1,
        unitPrice: effectivePrice(
          entry.product.id,
          entry.cycle,
          entry.listPrice
        ),
        planProductId: entry.product.id,
      },
    ]);
  }

  function addBlank() {
    setItems((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${prev.length}`,
        cycle: "ONE_TIME",
        description: "",
        quantity: 1,
        unitPrice: 0,
        planProductId: null,
      },
    ]);
  }

  function patchItem(key: string, patch: Partial<BuilderLineItem>) {
    setItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, ...patch } : i))
    );
  }

  function selectCompany(id: string) {
    setCompanyId(id);
    if (!contactId) {
      const billing = contacts.find(
        (c) => c.companyId === id && c.isBillingContact
      );
      if (billing) setContactId(billing.id);
    }
  }

  function submit() {
    if (!companyId) {
      toast.error("Select a company");
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    if (mixedCycles) {
      toast.error(
        "All recurring items must share one billing cycle — split into separate quotes for mixed cadences"
      );
      return;
    }
    const payload: QuoteInput = {
      companyId,
      contactId: contactId || null,
      projectId: projectId || null,
      leadId: leadId || null,
      validUntil: validUntil || null,
      terms: terms || null,
      lineItems: items.map((i) => ({
        cycle: i.cycle,
        description: i.description,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        planProductId: i.planProductId,
      })),
    };
    startTransition(async () => {
      const result = quoteId
        ? await updateQuote(quoteId, payload)
        : await createQuote(payload);
      if (result.ok) {
        toast.success(quoteId ? "Quote updated" : "Quote created");
        router.push(`/quotes/${result.id ?? quoteId}`);
      } else {
        toast.error(result.error ?? "Something went wrong");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Company *</Label>
            <Select value={companyId} onValueChange={selectCompany}>
              <SelectTrigger>
                <SelectValue placeholder="Select company" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Contact</Label>
            <Select
              value={contactId}
              onValueChange={setContactId}
              disabled={!companyId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select contact" />
              </SelectTrigger>
              <SelectContent>
                {companyContacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.isBillingContact ? " (AP)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Project</Label>
            <Select
              value={projectId}
              onValueChange={setProjectId}
              disabled={!companyId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Link a project" />
              </SelectTrigger>
              <SelectContent>
                {companyProjects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Lead</Label>
            <Select
              value={leadId}
              onValueChange={setLeadId}
              disabled={!companyId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Link a lead" />
              </SelectTrigger>
              <SelectContent>
                {companyLeads.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="validUntil">Valid until</Label>
            <Input
              id="validUntil"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Line items</CardTitle>
          <div className="flex items-center gap-2">
            <Select value="" onValueChange={addFromCatalog}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Add from catalog..." />
              </SelectTrigger>
              <SelectContent>
                {catalogEntries.map((e) => {
                  const price = effectivePrice(
                    e.product.id,
                    e.cycle,
                    e.listPrice
                  );
                  return (
                    <SelectItem key={e.value} value={e.value}>
                      {e.product.name} — {formatCurrency(price)}
                      {CYCLE_SUFFIX[e.cycle]}
                      {price !== e.listPrice ? " (negotiated)" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addBlank}
              className="gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Custom
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No line items. Add from the catalog or create a custom line.
            </p>
          )}
          {items.map((item) => (
            <div
              key={item.key}
              className="grid grid-cols-12 items-end gap-2 rounded-md border p-3"
            >
              <div className="col-span-12 space-y-1 sm:col-span-4">
                <Label className="text-xs">Description</Label>
                <Input
                  value={item.description}
                  onChange={(e) =>
                    patchItem(item.key, { description: e.target.value })
                  }
                  placeholder="BIGVIEW Trailer Rental"
                />
              </div>
              <div className="col-span-4 space-y-1 sm:col-span-3">
                <Label className="text-xs">Billing</Label>
                <Select
                  value={item.cycle}
                  onValueChange={(v) =>
                    patchItem(item.key, { cycle: v as BillingCycle })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CYCLES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CYCLE_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3 space-y-1 sm:col-span-1">
                <Label className="text-xs">Qty</Label>
                <Input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) =>
                    patchItem(item.key, {
                      quantity: Math.max(1, parseInt(e.target.value) || 1),
                    })
                  }
                />
              </div>
              <div className="col-span-4 space-y-1 sm:col-span-2">
                <Label className="text-xs">Unit price</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={item.unitPrice}
                  onChange={(e) =>
                    patchItem(item.key, {
                      unitPrice: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="col-span-9 flex items-center justify-end text-sm font-medium sm:col-span-1">
                {formatCurrency(item.quantity * item.unitPrice)}
                <span className="text-muted-foreground">
                  {CYCLE_SUFFIX[item.cycle]}
                </span>
              </div>
              <div className="col-span-3 flex justify-end sm:col-span-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setItems((prev) => prev.filter((i) => i.key !== item.key))
                  }
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          ))}

          {mixedCycles && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
              Recurring items use different billing cycles (
              {recurringCyclesUsed.map((c) => CYCLE_LABELS[c]).join(", ")}).
              Pick one cycle — a subscription bills on a single cadence.
            </p>
          )}

          {items.length > 0 && (
            <div className="flex flex-col items-end gap-1 border-t pt-3 text-sm">
              {recurringCyclesUsed.map((cycle) => (
                <p key={cycle}>
                  <span className="text-muted-foreground">
                    {CYCLE_LABELS[cycle]} recurring:{" "}
                  </span>
                  <span className="font-semibold">
                    {formatCurrency(totals.recurring[cycle] ?? 0)}
                    {CYCLE_SUFFIX[cycle]}
                  </span>
                </p>
              ))}
              {totals.oneTime > 0 && (
                <p>
                  <span className="text-muted-foreground">
                    One-time charges:{" "}
                  </span>
                  <span className="font-semibold">
                    {formatCurrency(totals.oneTime)}
                  </span>
                </p>
              )}
              {totals.monthlyEquivalent > 0 &&
                recurringCyclesUsed[0] !== "MONTHLY" && (
                  <p className="text-xs text-muted-foreground">
                    ≈ {formatCurrency(totals.monthlyEquivalent)}/mo equivalent
                  </p>
                )}
              <p className="text-base">
                <span className="text-muted-foreground">First invoice: </span>
                <span className="font-bold">
                  {formatCurrency(totals.firstInvoice)}
                </span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Terms</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={terms ?? ""}
            onChange={(e) => setTerms(e.target.value)}
            rows={4}
            placeholder="Rental terms, cancellation policy, site requirements..."
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={isPending}>
          {isPending ? "Saving..." : quoteId ? "Save changes" : "Create quote"}
        </Button>
      </div>
    </div>
  );
}
