"use client";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LinkIcon } from "lucide-react";

export function CopyLinkButton({ url }: { url: string }) {
  return (
    <Button
      variant="outline"
      className="gap-1"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        toast.success("Public quote link copied");
      }}
    >
      <LinkIcon className="h-4 w-4" />
      Copy link
    </Button>
  );
}
