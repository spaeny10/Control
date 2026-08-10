"use client";

import { useTransition } from "react";
import { setJobStatus, deleteJob } from "@/lib/actions/dispatch-actions";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Truck, PackageOpen, Wrench, MoreVertical } from "lucide-react";
import type { JobStatus, JobType } from "@prisma/client";

const typeIcons = { DELIVERY: Truck, PICKUP: PackageOpen, SERVICE: Wrench };
const typeColors = {
  DELIVERY: "border-l-[#2a78d6]",
  PICKUP: "border-l-[#eb6834]",
  SERVICE: "border-l-[#898781]",
};

export type DispatchJobView = {
  id: string;
  type: JobType;
  status: JobStatus;
  time: string;
  siteAddress: string | null;
  driverName: string | null;
  companyName: string | null;
  notes: string | null;
};

export function JobCard({ job }: { job: DispatchJobView }) {
  const [isPending, startTransition] = useTransition();
  const Icon = typeIcons[job.type];

  function update(status: JobStatus) {
    startTransition(async () => {
      const result = await setJobStatus(job.id, status);
      if (!result.ok) toast.error(result.error ?? "Failed");
    });
  }

  return (
    <div
      className={cn(
        "rounded-md border border-l-4 bg-background p-2 text-xs shadow-sm",
        typeColors[job.type],
        (job.status === "DONE" || job.status === "CANCELED") && "opacity-50",
        isPending && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-1.5 font-medium">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          {job.time} · {job.type.charAt(0) + job.type.slice(1).toLowerCase()}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded p-0.5 hover:bg-muted">
            <MoreVertical className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => update("IN_PROGRESS")}>
              Mark in progress
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => update("DONE")}>
              Mark done
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => update("CANCELED")}>
              Cancel job
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() =>
                startTransition(async () => {
                  const r = await deleteJob(job.id);
                  if (!r.ok) toast.error(r.error ?? "Failed");
                })
              }
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {job.companyName && <p className="mt-1">{job.companyName}</p>}
      {job.siteAddress && (
        <p className="text-muted-foreground">{job.siteAddress}</p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <Badge variant="outline" className="px-1 text-[10px]">
          {job.driverName ?? "Unassigned"}
        </Badge>
        {job.status !== "SCHEDULED" && (
          <Badge
            variant={job.status === "CANCELED" ? "destructive" : "secondary"}
            className="px-1 text-[10px]"
          >
            {job.status.replace("_", " ")}
          </Badge>
        )}
      </div>
    </div>
  );
}
