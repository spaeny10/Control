"use client";

import { useTransition } from "react";
import { setTrailerStatus } from "@/lib/actions/trailer-actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { TrailerStatus } from "@prisma/client";

export function TrailerStatusSelect({
  trailerId,
  status,
}: {
  trailerId: string;
  status: TrailerStatus;
}) {
  const [isPending, startTransition] = useTransition();

  // Set by dispatch, not by hand.
  if (status === "DEPLOYED") {
    return (
      <p className="text-sm text-muted-foreground">
        On site — a pickup job brings it back.
      </p>
    );
  }
  if (status === "ASSIGNED") {
    return (
      <p className="text-sm text-muted-foreground">
        Assigned to a job — a delivery job puts it on site.
      </p>
    );
  }

  return (
    <Select
      value={status}
      onValueChange={(v) => {
        startTransition(async () => {
          const result = await setTrailerStatus(
            trailerId,
            v as "AVAILABLE" | "MAINTENANCE" | "RETIRED"
          );
          if (!result.ok)
            toast.error(result.error ?? "Failed to update status");
        });
      }}
      disabled={isPending}
    >
      <SelectTrigger className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {/* Only reachable by a pickup; listed so the current value renders. */}
        {status === "INSPECTION" && (
          <SelectItem value="INSPECTION" disabled>
            Awaiting inspection
          </SelectItem>
        )}
        <SelectItem value="AVAILABLE">
          {status === "INSPECTION" ? "Passed — available" : "Available"}
        </SelectItem>
        <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
        <SelectItem value="RETIRED">Retired</SelectItem>
      </SelectContent>
    </Select>
  );
}
