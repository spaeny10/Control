"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { recordQuoteAcceptance } from "@/lib/actions/quote-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

/* For acceptances that happened off-platform. A quote must be ACCEPTED before
   it can convert to a subscription, and construction customers say yes on the
   phone as often as they click a link. */
export function RecordAcceptanceDialog({
  quoteId,
  defaultName,
  wasExpired,
}: {
  quoteId: string;
  /** The billing/primary contact — usually who actually accepted. */
  defaultName?: string | null;
  wasExpired?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState("PHONE");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const today = new Date().toISOString().slice(0, 10);

  function handleSubmit(formData: FormData) {
    formData.set("acceptedVia", method);
    startTransition(async () => {
      const result = await recordQuoteAcceptance(quoteId, formData);
      if (result.ok) {
        toast.success("Quote marked accepted — you can convert it now");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-1">
          <CheckCircle2 className="h-4 w-4" /> Mark accepted
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark accepted</DialogTitle>
          <DialogDescription>
            For a customer who accepted off-platform. Recorded as accepted on
            their behalf by you — never as an online signature.
            {wasExpired &&
              " This quote had already expired; that's noted on the record."}
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="acceptedByName">
              Who at the customer accepted? *
            </Label>
            <Input
              id="acceptedByName"
              name="acceptedByName"
              required
              defaultValue={defaultName ?? ""}
              placeholder="Dana Rivera"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>How *</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PHONE">Phone</SelectItem>
                  <SelectItem value="EMAIL">Email reply</SelectItem>
                  <SelectItem value="SIGNED_DOCUMENT">
                    Signed document
                  </SelectItem>
                  <SelectItem value="IN_PERSON">In person</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="acceptedAt">On *</Label>
              <Input
                id="acceptedAt"
                name="acceptedAt"
                type="date"
                required
                max={today}
                defaultValue={today}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Textarea
              id="note"
              name="note"
              rows={2}
              placeholder="Confirmed scope on the 10am call; PO to follow."
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Mark accepted"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
