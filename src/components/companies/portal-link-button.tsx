"use client";

import { useTransition } from "react";
import { getPortalLink } from "@/lib/actions/portal-actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Globe } from "lucide-react";

export function PortalLinkButton({ companyId }: { companyId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await getPortalLink(companyId);
          if (result.ok && result.url) {
            await navigator.clipboard.writeText(result.url);
            toast.success("Customer portal link copied");
          } else {
            toast.error(result.error ?? "Failed to get portal link");
          }
        })
      }
    >
      <Globe className="h-3.5 w-3.5" />
      {isPending ? "..." : "Portal link"}
    </Button>
  );
}
