"use client";

import { useState, useTransition } from "react";
import { adjustSubscriptionBilling } from "@/lib/actions/subscription-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";
import { SlidersHorizontal } from "lucide-react";

export function AdjustBillingDialog({
  subscriptionId,
  currentCycleAmount,
  cycleSuffix,
  hasStripe,
}: {
  subscriptionId: string;
  currentCycleAmount: number;
  cycleSuffix: string;
  hasStripe: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(currentCycleAmount));
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Adjust billing
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust billing</DialogTitle>
          <DialogDescription>
            Currently {formatCurrency(currentCycleAmount)}
            {cycleSuffix}. Use for returned units, negotiated changes, or
            corrections — the change is logged to the activity feed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newAmount">
              New amount {cycleSuffix ? `(${cycleSuffix.slice(1)})` : ""}
            </Label>
            <Input
              id="newAmount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Reason</Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Returned 1 unit early"
            />
          </div>
          {hasStripe && (
            <p className="rounded-md border border-[#eb6834]/40 bg-[#eb6834]/5 p-2 text-xs text-muted-foreground">
              This subscription bills through Stripe — update its line items
              in the Stripe dashboard to match, or the next invoice will use
              the old amount.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={isPending || !(parseFloat(amount) >= 0)}
              onClick={() =>
                startTransition(async () => {
                  const result = await adjustSubscriptionBilling(
                    subscriptionId,
                    parseFloat(amount),
                    note || undefined
                  );
                  if (result.ok) {
                    toast.success("Billing adjusted");
                    setOpen(false);
                  } else {
                    toast.error(result.error ?? "Failed to adjust");
                  }
                })
              }
            >
              {isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
