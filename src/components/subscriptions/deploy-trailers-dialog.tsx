"use client";

import { useState, useTransition } from "react";
import { deployTrailers } from "@/lib/actions/subscription-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export function DeployTrailersDialog({
  subscriptionId,
  availableTrailers,
  defaultUnitRate,
  cycleSuffix,
}: {
  subscriptionId: string;
  availableTrailers: { id: string; unitNumber: string; model: string | null }[];
  // Prefilled per-unit rate (from the subscription's quote), editable.
  defaultUnitRate: number;
  cycleSuffix: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [addToBilling, setAddToBilling] = useState(true);
  const [rate, setRate] = useState(String(defaultUnitRate || ""));
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const parsedRate = parseFloat(rate) || 0;
  const increase = addToBilling ? parsedRate * selected.length : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSelected([]);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <Plus className="h-3.5 w-3.5" /> Deploy trailers
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deploy additional trailers</DialogTitle>
        </DialogHeader>
        {availableTrailers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No trailers available right now.
          </p>
        ) : (
          <div className="space-y-2">
            {availableTrailers.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm hover:bg-muted/50"
              >
                <Checkbox
                  checked={selected.includes(t.id)}
                  onCheckedChange={() => toggle(t.id)}
                />
                <span className="font-medium">{t.unitNumber}</span>
                <span className="text-muted-foreground">{t.model}</span>
              </label>
            ))}
          </div>
        )}

        <div className="space-y-3 rounded-md border p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={addToBilling}
              onCheckedChange={(v) => setAddToBilling(v === true)}
            />
            Add these units to billing
          </label>
          {addToBilling && (
            <div className="space-y-2">
              <Label htmlFor="unitRate">
                Rate per unit ({cycleSuffix.replace("/", "per ") || "per cycle"})
              </Label>
              <Input
                id="unitRate"
                type="number"
                min="0"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
              {selected.length > 0 && parsedRate > 0 && (
                <p className="text-xs text-muted-foreground">
                  Billing increases by {formatCurrency(increase)}
                  {cycleSuffix} ({selected.length} ×{" "}
                  {formatCurrency(parsedRate)}). Stripe prorates from today
                  when connected.
                </p>
              )}
            </div>
          )}
          {!addToBilling && (
            <p className="text-xs text-muted-foreground">
              Units go on site with no price change (e.g. a free swap or
              goodwill unit).
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={
              isPending ||
              selected.length === 0 ||
              (addToBilling && !(parsedRate >= 0))
            }
            onClick={() =>
              startTransition(async () => {
                const result = await deployTrailers(
                  subscriptionId,
                  selected,
                  addToBilling ? { unitRate: parsedRate } : null
                );
                if (result.ok) {
                  toast.success(
                    increase > 0
                      ? `Trailers deployed — billing +${formatCurrency(increase)}${cycleSuffix}`
                      : "Trailers deployed"
                  );
                  setOpen(false);
                  setSelected([]);
                } else {
                  toast.error(result.error ?? "Failed to deploy");
                }
              })
            }
          >
            {isPending ? "Deploying..." : `Deploy ${selected.length || ""}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
