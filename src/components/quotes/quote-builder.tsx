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
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export type CatalogProduct = {
  id: string;
  name: string;
  kind: "RECURRING_MONTHLY" | "ONE_TIME";
  unitPrice: number;
  description: string | null;
};

export type BuilderLineItem = {
  key: string;
  kind: "RECURRING_MONTHLY" | "ONE_TIME";
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
  // { companyId: { planProductId: negotiatedPrice } }
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

  const monthlyTotal = items
    .filter((i) => i.kind === "RECURRING_MONTHLY")
    .reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
  const oneTimeTotal = items
    .filter((i) => i.kind === "ONE_TIME")
    .reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

  // Negotiated per-company price wins over the catalog default.
  function effectivePrice(product: CatalogProduct) {
    return priceOverrides[companyId]?.[product.id] ?? product.unitPrice;
  }

  function addFromCatalog(productId: string) {
    const product = catalog.find((p) => p.id === productId);
    if (!product) return;
    setItems((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${prev.length}`,
        kind: product.kind,
        description: product.name,
        quantity: 1,
        unitPrice: effectivePrice(product),
        planProductId: product.id,
      },
    ]);
  }

  function selectCompany(id: string) {
    setCompanyId(id);
    // Default to the branch's AP/billing contact if none picked yet.
    if (!contactId) {
      const billing = contacts.find(
        (c) => c.companyId === id && c.isBillingContact
      );
      if (billing) setContactId(billing.id);
    }
  }

  function addBlank() {
    setItems((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${prev.length}`,
        kind: "ONE_TIME",
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

  function submit() {
    if (!companyId) {
      toast.error("Select a company");
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one line item");
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
        kind: i.kind,
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
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Add from catalog..." />
              </SelectTrigger>
              <SelectContent>
                {catalog.map((p) => {
                  const price = effectivePrice(p);
                  return (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {formatCurrency(price)}
                      {p.kind === "RECURRING_MONTHLY" ? "/mo" : ""}
                      {price !== p.unitPrice ? " (negotiated)" : ""}
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
                  placeholder="BIGVIEW Trailer — Monthly"
                />
              </div>
              <div className="col-span-4 space-y-1 sm:col-span-3">
                <Label className="text-xs">Type</Label>
                <Select
                  value={item.kind}
                  onValueChange={(v) =>
                    patchItem(item.key, { kind: v as BuilderLineItem["kind"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RECURRING_MONTHLY">
                      Monthly recurring
                    </SelectItem>
                    <SelectItem value="ONE_TIME">One-time</SelectItem>
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

          {items.length > 0 && (
            <div className="flex flex-col items-end gap-1 border-t pt-3 text-sm">
              <p>
                <span className="text-muted-foreground">Monthly recurring: </span>
                <span className="font-semibold">
                  {formatCurrency(monthlyTotal)}/mo
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">One-time charges: </span>
                <span className="font-semibold">
                  {formatCurrency(oneTimeTotal)}
                </span>
              </p>
              <p className="text-base">
                <span className="text-muted-foreground">First invoice: </span>
                <span className="font-bold">
                  {formatCurrency(monthlyTotal + oneTimeTotal)}
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
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            rows={4}
            placeholder="Rental terms, cancellation policy, site requirements..."
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button onClick={submit} disabled={isPending}>
          {isPending
            ? "Saving..."
            : quoteId
              ? "Save changes"
              : "Create quote"}
        </Button>
      </div>
    </div>
  );
}
