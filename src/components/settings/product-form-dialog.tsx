"use client";

import { useState, useTransition } from "react";
import {
  createProduct,
  updateProduct,
  setProductActive,
  type ProductInput,
} from "@/lib/actions/catalog-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CYCLES, CYCLE_LABELS } from "@/lib/cycles";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import type { BillingCycle } from "@prisma/client";

type ProductValues = {
  id?: string;
  name?: string;
  description?: string | null;
  isActive?: boolean;
  prices?: { cycle: BillingCycle; unitPrice: number }[];
};

export function ProductFormDialog({ product }: { product?: ProductValues }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [prices, setPrices] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const p of product?.prices ?? []) {
      initial[p.cycle] = String(p.unitPrice);
    }
    return initial;
  });
  const [isPending, startTransition] = useTransition();
  const isEdit = !!product?.id;

  function submit() {
    const priceList = CYCLES.filter(
      (c) => prices[c] !== undefined && prices[c] !== ""
    ).map((c) => ({ cycle: c, unitPrice: parseFloat(prices[c]) }));

    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (priceList.length === 0) {
      toast.error("Set at least one price");
      return;
    }
    if (priceList.some((p) => isNaN(p.unitPrice) || p.unitPrice < 0)) {
      toast.error("Prices must be valid numbers");
      return;
    }

    const payload: ProductInput = {
      name: name.trim(),
      description: description || null,
      prices: priceList,
    };

    startTransition(async () => {
      const result = isEdit
        ? await updateProduct(product!.id!, payload)
        : await createProduct(payload);
      if (result.ok) {
        toast.success(isEdit ? "Product updated" : "Product added");
        setOpen(false);
      } else {
        toast.error(result.error ?? "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="sm">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button size="sm" className="gap-1">
            <Plus className="h-4 w-4" /> Add product
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit catalog product" : "Add catalog product"}
          </DialogTitle>
          <DialogDescription>
            Set a price for each billing cycle you offer — leave the rest
            blank.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="BIGVIEW Trailer Rental"
            />
          </div>
          <div className="space-y-2">
            <Label>Prices</Label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {CYCLES.map((cycle) => (
                <div key={cycle} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {CYCLE_LABELS[cycle]}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="—"
                    value={prices[cycle] ?? ""}
                    onChange={(e) =>
                      setPrices((p) => ({ ...p, [cycle]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={2}
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            {isEdit && product && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await setProductActive(
                      product.id!,
                      !product.isActive
                    );
                    if (result.ok) {
                      toast.success(
                        product.isActive ? "Product archived" : "Product restored"
                      );
                      setOpen(false);
                    } else {
                      toast.error(result.error ?? "Failed");
                    }
                  })
                }
              >
                {product.isActive ? "Archive" : "Restore"}
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={isPending}>
                {isPending ? "Saving..." : isEdit ? "Save" : "Add"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
