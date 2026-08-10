"use client";

import { useState, useTransition } from "react";
import { endSubscription } from "@/lib/actions/subscription-actions";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { SubscriptionEndReason } from "@prisma/client";

const REASONS: {
  value: SubscriptionEndReason;
  label: string;
  hint: string;
}[] = [
  {
    value: "PROJECT_COMPLETED",
    label: "Project completed",
    hint: "Natural roll-off — the job wrapped up. Not counted as churn.",
  },
  {
    value: "CUSTOMER_CANCELED",
    label: "Customer canceled early",
    hint: "Customer ended before the project finished. Counted as churn.",
  },
  {
    value: "LOST_TO_COMPETITOR",
    label: "Lost to competitor",
    hint: "Counted as churn.",
  },
  {
    value: "NON_PAYMENT",
    label: "Non-payment",
    hint: "Counted as churn.",
  },
  { value: "OTHER", label: "Other", hint: "Counted as churn." },
];

export function EndSubscriptionDialog({
  subscriptionId,
}: {
  subscriptionId: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<SubscriptionEndReason | "">("");
  const [isPending, startTransition] = useTransition();

  const selectedReason = REASONS.find((r) => r.value === reason);

  function submit(formData: FormData) {
    if (!reason) {
      toast.error("Select an end reason");
      return;
    }
    startTransition(async () => {
      const result = await endSubscription(
        subscriptionId,
        reason,
        String(formData.get("endNotes") ?? "") || undefined
      );
      if (result.ok) {
        toast.success("Subscription ended — trailers returned");
        setOpen(false);
      } else {
        toast.error(result.error ?? "Failed to end subscription");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">End subscription</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>End subscription</DialogTitle>
          <DialogDescription>
            Cancels billing, returns all deployed trailers, and records why it
            ended. Project completion is normal roll-off — it never counts as
            churn.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>End reason *</Label>
            <Select
              value={reason}
              onValueChange={(v) => setReason(v as SubscriptionEndReason)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Why is this ending?" />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedReason && (
              <p className="text-xs text-muted-foreground">
                {selectedReason.hint}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="endNotes">Notes</Label>
            <Textarea
              id="endNotes"
              name="endNotes"
              rows={2}
              placeholder="Optional context"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? "Ending..." : "End subscription"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
