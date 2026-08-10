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
import type { LeadStage } from "@prisma/client";
import { Building2, HardHat } from "lucide-react";

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

const STAGES: { key: LeadStage; label: string }[] = [
  { key: "NEW", label: "New" },
  { key: "CONTACTED", label: "Contacted" },
  { key: "QUALIFIED", label: "Qualified" },
  { key: "QUOTE_SENT", label: "Quote Sent" },
  { key: "WON", label: "Won" },
  { key: "LOST", label: "Lost" },
];

export function LeadsKanban({ leads }: { leads: KanbanLead[] }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<LeadStage | null>(null);
  const [lostLead, setLostLead] = useState<KanbanLead | null>(null);
  const [isPending, startTransition] = useTransition();

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
        {STAGES.map((stage) => {
          const stageLeads = leads.filter((l) => l.stage === stage.key);
          // Column header shows pipeline MRR — the number that compounds.
          const total = stageLeads.reduce(
            (sum, l) => sum + (l.estMrr ?? 0),
            0
          );
          return (
            <div
              key={stage.key}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(stage.key);
              }}
              onDragLeave={() => setDragOverStage(null)}
              onDrop={() => handleDrop(stage.key)}
              className={cn(
                "flex w-64 shrink-0 flex-col rounded-lg border bg-muted/40 transition-colors",
                dragOverStage === stage.key && "border-primary bg-primary/5",
                isPending && "opacity-70"
              )}
            >
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-semibold">{stage.label}</span>
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
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className="gap-1 px-1.5 text-[10px]"
                      >
                        {lead.type === "NEW_COMPANY" ? (
                          <Building2 className="h-3 w-3" />
                        ) : (
                          <HardHat className="h-3 w-3" />
                        )}
                        {lead.type === "NEW_COMPANY"
                          ? "New company"
                          : "New project"}
                      </Badge>
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
            <DialogTitle>Mark lead as lost</DialogTitle>
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
                Mark lost
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
