"use client";

import { useState, useTransition } from "react";
import { deployTrailers } from "@/lib/actions/subscription-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";

export function DeployTrailersDialog({
  subscriptionId,
  availableTrailers,
}: {
  subscriptionId: string;
  availableTrailers: { id: string; unitNumber: string; model: string | null }[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

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
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={isPending || selected.length === 0}
            onClick={() =>
              startTransition(async () => {
                const result = await deployTrailers(subscriptionId, selected);
                if (result.ok) {
                  toast.success("Trailers deployed");
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
