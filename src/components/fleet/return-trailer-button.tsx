"use client";

import { useTransition } from "react";
import { returnTrailer } from "@/lib/actions/trailer-actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";

export function ReturnTrailerButton({
  deploymentId,
  unitNumber,
}: {
  deploymentId: string;
  unitNumber?: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await returnTrailer(deploymentId);
          if (result.ok) {
            toast.success(
              unitNumber ? `${unitNumber} returned` : "Trailer returned"
            );
          } else {
            toast.error(result.error ?? "Failed to return trailer");
          }
        });
      }}
    >
      <Undo2 className="h-3.5 w-3.5" />
      {isPending ? "Returning..." : "Mark returned"}
    </Button>
  );
}
