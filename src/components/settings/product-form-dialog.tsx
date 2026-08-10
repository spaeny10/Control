"use client";

import { useState, useTransition } from "react";
import {
  createProduct,
  updateProduct,
  setProductActive,
} from "@/lib/actions/catalog-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";

type ProductValues = {
  id?: string;
  name?: string;
  kind?: "RECURRING_MONTHLY" | "ONE_TIME";
  unitPrice?: number;
  description?: string | null;
  isActive?: boolean;
};

export function ProductFormDialog({ product }: { product?: ProductValues }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isEdit = !!product?.id;

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = isEdit
        ? await updateProduct(product!.id!, formData)
        : await createProduct(formData);
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
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              name="name"
              required
              placeholder="BIGVIEW Trailer — Monthly"
              defaultValue={product?.name ?? ""}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select name="kind" defaultValue={product?.kind ?? "RECURRING_MONTHLY"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RECURRING_MONTHLY">Monthly recurring</SelectItem>
                  <SelectItem value="ONE_TIME">One-time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unitPrice">Unit price ($) *</Label>
              <Input
                id="unitPrice"
                name="unitPrice"
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue={product?.unitPrice ?? ""}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={product?.description ?? ""}
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
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : isEdit ? "Save" : "Add"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
