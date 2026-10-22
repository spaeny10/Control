"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { completeJob, setJobStatus } from "@/lib/actions/dispatch-actions";
import { DeploymentDocsDialog } from "@/components/fleet/deployment-docs-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { JobStatus, JobType } from "@prisma/client";

export type JobUnit = {
  trailerId: string;
  unitNumber: string;
  deploymentId: string;
  /** Planned on this job — pre-checked. */
  planned: boolean;
  photoCount: number;
  signed: boolean;
};

/* The driver's checklist. Each unit can be documented (photos + signature) and
   ticked off; completing moves only the ticked ones, so a partial run leaves
   the rest in the queue rather than pretending they moved. */
export function JobUnitsPanel({
  jobId,
  type,
  status,
  units,
}: {
  jobId: string;
  type: JobType;
  status: JobStatus;
  units: JobUnit[];
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(units.filter((u) => u.planned).map((u) => u.trailerId))
  );
  const [isPending, startTransition] = useTransition();
  const open = status === "SCHEDULED" || status === "IN_PROGRESS";
  const phase = type === "DELIVERY" ? "DELIVERY" : "RETURN";
  const verb = type === "DELIVERY" ? "delivered" : "picked up";

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function complete() {
    startTransition(async () => {
      const r = await completeJob(jobId, type === "SERVICE" ? [] : [...selected]);
      if (r.ok) toast.success("Job completed");
      else toast.error(r.error ?? "Failed");
    });
  }

  function start() {
    startTransition(async () => {
      const r = await setJobStatus(jobId, "IN_PROGRESS");
      if (!r.ok) toast.error(r.error ?? "Failed");
    });
  }

  const undocumented = units.filter(
    (u) => selected.has(u.trailerId) && (u.photoCount === 0 || !u.signed)
  ).length;

  return (
    <div className="space-y-4">
      {type !== "SERVICE" && (
        <div className="divide-y rounded-md border">
          {units.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              {open
                ? type === "DELIVERY"
                  ? "No units on this contract are waiting in the yard."
                  : "No units on this contract are on site."
                : "No units were recorded on this job."}
            </p>
          )}
          {units.map((u) => (
            <div
              key={u.trailerId}
              className="flex flex-wrap items-center justify-between gap-3 p-3"
            >
              <label className="flex min-w-0 items-center gap-3">
                {open && (
                  <Checkbox
                    checked={selected.has(u.trailerId)}
                    onCheckedChange={(v) => toggle(u.trailerId, v === true)}
                    aria-label={`${u.unitNumber} ${verb}`}
                  />
                )}
                <span className="min-w-0">
                  <Link
                    href={`/fleet/${u.trailerId}`}
                    className="font-medium hover:underline"
                  >
                    {u.unitNumber}
                  </Link>
                  <span className="ml-2 inline-flex gap-1">
                    <Badge variant={u.photoCount > 0 ? "secondary" : "outline"}>
                      {u.photoCount} photo{u.photoCount === 1 ? "" : "s"}
                    </Badge>
                    <Badge variant={u.signed ? "secondary" : "outline"}>
                      {u.signed ? "Signed" : "Not signed"}
                    </Badge>
                  </span>
                </span>
              </label>
              <DeploymentDocsDialog
                deploymentId={u.deploymentId}
                unitNumber={u.unitNumber}
                defaultPhase={phase}
              />
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="flex flex-wrap items-center gap-2">
          {status === "SCHEDULED" && (
            <Button variant="outline" onClick={start} disabled={isPending}>
              Start job
            </Button>
          )}
          <Button
            onClick={complete}
            disabled={isPending || (type !== "SERVICE" && selected.size === 0)}
          >
            {type === "SERVICE"
              ? "Complete service visit"
              : `Complete — ${selected.size} unit${selected.size === 1 ? "" : "s"} ${verb}`}
          </Button>
          {type !== "SERVICE" && selected.size < units.length && selected.size > 0 && (
            <p className="text-xs text-muted-foreground">
              Unticked units stay {type === "DELIVERY" ? "in the yard" : "on site"} and
              go back in the queue.
            </p>
          )}
          {undocumented > 0 && (
            <p className="w-full text-xs text-muted-foreground">
              {undocumented} ticked unit{undocumented === 1 ? " has" : "s have"} no
              condition photos or signature yet — that&apos;s the record if the
              customer disputes damage.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
