"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setLeadStage } from "@/lib/actions/lead-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { toast } from "sonner";
import {
  stagesForTrack,
  stageLabel,
  isRevenueTrack,
  OPEN_PIPELINE_STAGES,
} from "@/lib/lead-tracks";
import type { LeadStage, LeadType } from "@prisma/client";

export type KanbanLead = {
  id: string;
  title: string;
  type: "NEW_COMPANY" | "NEW_PROJECT";
  stage: LeadStage;
  estMrr: number | null;
  estValue: number | null;
  companyName: string | null;
  contactName: string | null;
  ownerName: string | null;
};

export function LeadsKanban({
  leads,
  track,
}: {
  leads: KanbanLead[];
  /** The board shows one track at a time, so stages and money are per-track. */
  track: LeadType;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<LeadStage | null>(null);
  const [lostLead, setLostLead] = useState<KanbanLead | null>(null);
  const [isPending, startTransition] = useTransition();
  const stages = stagesForTrack(track);
  const showMoney = isRevenueTrack(track);
  const lostLabel = stageLabel(track, "LOST");

  function moveLead(lead: KanbanLead, stage: LeadStage, lostReason?: string) {
    if (lead.stage === stage) return;
    startTransition(async () => {
      const result = await setLeadStage(lead.id, stage, lostReason);
      if (!result.ok) toast.error(result.error ?? "Failed to move lead");
    });
  }

  function handleDrop(stage: LeadStage) {
    setDragOverStage(null);
    const lead = leads.find((l) => l.id === dragId);
    setDragId(null);
    if (!lead || lead.stage === stage) return;
    if (stage === "LOST") {
      setLostLead(lead);
      return;
    }
    moveLead(lead, stage);
  }

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageLeads = leads.filter((l) => l.stage === stage);
          // Money only where money means something: the revenue track, and
          // only for stages that belong in a forecast. A total on Lost is
          // noise, and a total on Unqualified invites treating it as pipeline.
          const showTotal = showMoney && OPEN_PIPELINE_STAGES.includes(stage);
          const total = showTotal
            ? stageLeads.reduce((sum, l) => sum + (l.estMrr ?? 0), 0)
            : 0;
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(stage);
              }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={() => handleDrop(stage)}
              className={cn(
                "flex w-64 shrink-0 flex-col rounded-lg border bg-muted/40 transition-colors",
                dragOverStage === stage && "border-primary bg-primary/5",
                isPending && "opacity-70"
              )}
            >
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-semibold">
                  {stageLabel(track, stage)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {stageLeads.length}
                  {total > 0 && ` · ${formatCurrency(total)}/mo`}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-2">
                {stageLeads.map((lead) => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={() => setDragId(lead.id)}
                    onDragEnd={() => setDragId(null)}
                    className={cn(
                      "cursor-grab rounded-md border bg-background p-3 shadow-sm active:cursor-grabbing",
                      dragId === lead.id && "opacity-50"
                    )}
                  >
                    <Link
                      href={`/leads/${lead.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {lead.title}
                    </Link>
                    {/* No type badge — the board is one track, so it would
                        be the same on every card. */}
                    {showMoney &&
                      (lead.estMrr !== null || lead.estValue !== null) && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {lead.estMrr !== null && (
                            <span className="text-xs font-medium text-foreground">
                              {formatCurrency(lead.estMrr)}/mo
                            </span>
                          )}
                          {lead.estValue !== null && (
                            <span className="text-xs text-muted-foreground">
                              {formatCurrency(lead.estValue)} total
                            </span>
                          )}
                        </div>
                      )}
                    {(lead.companyName || lead.contactName) && (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {[lead.companyName, lead.contactName]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                ))}
                {stageLeads.length === 0 && (
                  <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                    Drop leads here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog
        open={!!lostLead}
        onOpenChange={(open) => !open && setLostLead(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark lead as {lostLabel.toLowerCase()}</DialogTitle>
          </DialogHeader>
          <form
            action={(formData) => {
              const reason = String(formData.get("lostReason") ?? "");
              if (lostLead) moveLead(lostLead, "LOST", reason);
              setLostLead(null);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="lostReason">Reason</Label>
              <Input
                id="lostReason"
                name="lostReason"
                placeholder="Went with competitor"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLostLead(null)}
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
