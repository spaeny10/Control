"use client";

import { useState, useTransition } from "react";
import { setLeadStage } from "@/lib/actions/lead-actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { LeadStage } from "@prisma/client";

const STAGES: { key: LeadStage; label: string }[] = [
  { key: "NEW", label: "New" },
  { key: "CONTACTED", label: "Contacted" },
  { key: "QUALIFIED", label: "Qualified" },
  { key: "QUOTE_SENT", label: "Quote Sent" },
  { key: "WON", label: "Won" },
  { key: "LOST", label: "Lost" },
];

export function LeadStageSelect({
  leadId,
  stage,
}: {
  leadId: string;
  stage: LeadStage;
}) {
  const [lostOpen, setLostOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function change(next: LeadStage, lostReason?: string) {
    startTransition(async () => {
      const result = await setLeadStage(leadId, next, lostReason);
      if (!result.ok) toast.error(result.error ?? "Failed to update stage");
    });
  }

  return (
    <>
      <Select
        value={stage}
        onValueChange={(v) => {
          if (v === "LOST") setLostOpen(true);
          else change(v as LeadStage);
        }}
        disabled={isPending}
      >
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STAGES.map((s) => (
            <SelectItem key={s.key} value={s.key}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={lostOpen} onOpenChange={setLostOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark lead as lost</DialogTitle>
          </DialogHeader>
          <form
            action={(formData) => {
              change("LOST", String(formData.get("lostReason") ?? ""));
              setLostOpen(false);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="lostReason">Reason</Label>
              <Input id="lostReason" name="lostReason" autoFocus />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLostOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive">
                Mark lost
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
