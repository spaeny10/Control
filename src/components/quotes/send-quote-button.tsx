"use client";

import { useTransition } from "react";
import { sendQuote } from "@/lib/actions/quote-actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Send } from "lucide-react";

export function SendQuoteButton({
  quoteId,
  resend,
}: {
  quoteId: string;
  resend?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      className="gap-1"
      variant={resend ? "outline" : "default"}
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await sendQuote(quoteId);
          if (result.ok) {
            toast.success(
              "Quote marked sent — public link logged in the activity feed"
            );
          } else {
            toast.error(result.error ?? "Failed to send quote");
          }
        });
      }}
    >
      <Send className="h-4 w-4" />
      {isPending ? "Sending..." : resend ? "Mark re-sent" : "Send quote"}
    </Button>
  );
}
