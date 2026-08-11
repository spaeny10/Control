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
import { stagesForTrack, stageLabel } from "@/lib/lead-tracks";
import type { LeadStage, LeadType } from "@prisma/client";

export function LeadStageSelect({
  leadId,
  stage,
  type,
}: {
  leadId: string;
  stage: LeadStage;
  type: LeadType;
}) {
  const [lostOpen, setLostOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  // Organization leads have no QUOTE_SENT stage, and read Won/Lost as
  // "Vendor approved" / "Not a fit".
  const stages = stagesForTrack(type);
  const lostLabel = stageLabel(type, "LOST");

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
          {stages.map((s) => (
            <SelectItem key={s} value={s}>
              {stageLabel(type, s)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={lostOpen} onOpenChange={setLostOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark lead as {lostLabel.toLowerCase()}</DialogTitle>
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
                Mark {lostLabel.toLowerCase()}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
