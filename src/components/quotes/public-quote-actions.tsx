"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptQuote, declineQuote } from "@/lib/actions/quote-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

export function PublicQuoteActions({ token }: { token: string }) {
  const [declineOpen, setDeclineOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="space-y-4">
      <form
        action={(formData) => {
          startTransition(async () => {
            const result = await acceptQuote(token, formData);
            if (result.ok) {
              toast.success("Quote accepted — thank you!");
              router.refresh();
            } else {
              toast.error(result.error ?? "Something went wrong");
            }
          });
        }}
        className="space-y-3"
      >
        <div className="space-y-2">
          <Label htmlFor="name">Your full name</Label>
          <Input
            id="name"
            name="name"
            required
            placeholder="Type your name to accept"
          />
        </div>
        <Button
          type="submit"
          size="lg"
          className="w-full gap-2"
          disabled={isPending}
        >
          <CheckCircle2 className="h-5 w-5" />
          {isPending ? "Submitting..." : "Accept quote"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          By accepting you agree to the quote line items and terms above.
        </p>
      </form>

      <div className="text-center">
        <button
          type="button"
          onClick={() => setDeclineOpen(true)}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Decline this quote
        </button>
      </div>

      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Decline quote</DialogTitle>
          </DialogHeader>
          <form
            action={(formData) => {
              startTransition(async () => {
                const result = await declineQuote(token, formData);
                if (result.ok) {
                  toast.success("Quote declined");
                  setDeclineOpen(false);
                  router.refresh();
                } else {
                  toast.error(result.error ?? "Something went wrong");
                }
              });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Textarea
                id="reason"
                name="reason"
                rows={3}
                placeholder="Help us understand what didn't fit"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeclineOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={isPending}>
                Decline
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
