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

  if (status === "DEPLOYED") {
    return (
      <p className="text-sm text-muted-foreground">
        Deployed — return it from its site to change status.
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
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="AVAILABLE">Available</SelectItem>
        <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
        <SelectItem value="RETIRED">Retired</SelectItem>
      </SelectContent>
    </Select>
  );
}
