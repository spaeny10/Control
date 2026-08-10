"use client";

import { useState, useTransition } from "react";
import { createJob } from "@/lib/actions/dispatch-actions";
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
import { Plus } from "lucide-react";

export function JobFormDialog({
  drivers,
  subscriptions,
  prefill,
  triggerLabel,
}: {
  drivers: { id: string; name: string }[];
  subscriptions: { id: string; label: string }[];
  prefill?: {
    type?: "DELIVERY" | "PICKUP" | "SERVICE";
    subscriptionId?: string;
    scheduledFor?: string;
  };
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createJob(formData);
      if (result.ok) {
        toast.success("Job scheduled");
        setOpen(false);
      } else {
        toast.error(result.error ?? "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="gap-1"
          variant={triggerLabel ? "outline" : "default"}
        >
          <Plus className="h-4 w-4" /> {triggerLabel ?? "New job"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule dispatch job</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select name="type" defaultValue={prefill?.type ?? "DELIVERY"}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DELIVERY">Delivery</SelectItem>
                  <SelectItem value="PICKUP">Pickup</SelectItem>
                  <SelectItem value="SERVICE">Service</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scheduledFor">When *</Label>
              <Input
                id="scheduledFor"
                name="scheduledFor"
                type="datetime-local"
                required
                defaultValue={prefill?.scheduledFor}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Subscription / site</Label>
            <Select
              name="subscriptionId"
              defaultValue={prefill?.subscriptionId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Link a subscription (optional)" />
              </SelectTrigger>
              <SelectContent>
                {subscriptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Site address auto-fills from the linked project.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Assigned to</Label>
            <Select name="driverId">
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="siteAddress">Site address (override)</Label>
            <Input id="siteAddress" name="siteAddress" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Scheduling..." : "Schedule"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
