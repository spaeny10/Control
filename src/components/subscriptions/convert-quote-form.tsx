"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { convertQuoteToSubscription } from "@/lib/actions/subscription-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { format } from "date-fns";

export function ConvertQuoteForm({
  quoteId,
  suggestedUnits,
  availableTrailers,
}: {
  quoteId: string;
  suggestedUnits: number;
  availableTrailers: { id: string; unitNumber: string; model: string | null }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  // Local date — toISOString() would roll to tomorrow on a US evening.
  const today = format(new Date(), "yyyy-MM-dd");
  const [startDate, setStartDate] = useState(today);
  const [startUnknown, setStartUnknown] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function submit() {
    startTransition(async () => {
      const result = await convertQuoteToSubscription({
        quoteId,
        trailerIds: selected,
        startDate: startUnknown ? undefined : startDate,
      });
      if (result.ok) {
        toast.success(
          startUnknown || startDate > today
            ? "Subscription created — billing not started yet"
            : "Subscription created — billing active, first invoice raised"
        );
        router.push(`/subscriptions/${result.id}`);
      } else {
        toast.error(result.error ?? "Conversion failed");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Assign trailers</CardTitle>
        <CardDescription>
          Quote calls for {suggestedUnits} unit{suggestedUnits === 1 ? "" : "s"}.
          Only available trailers are listed — you can also add units later.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {availableTrailers.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No trailers available right now. You can convert without units
              and deploy them when they free up.
            </p>
          )}
          {availableTrailers.map((t) => (
            <label
              key={t.id}
              className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm hover:bg-muted/50"
            >
              <Checkbox
                checked={selected.includes(t.id)}
                onCheckedChange={() => toggle(t.id)}
              />
              <span className="font-medium">{t.unitNumber}</span>
              <span className="text-muted-foreground">{t.model}</span>
            </label>
          ))}
        </div>

        {/* Billing start is independent of delivery: the selected units are
            only assigned here, and a dispatch job puts them on site — before
            or after billing starts. */}
        <div className="max-w-md space-y-2">
          <Label htmlFor="startDate">Billing starts</Label>
          <Input
            id="startDate"
            type="date"
            value={startDate}
            disabled={startUnknown}
            onChange={(e) => setStartDate(e.target.value)}
            className="max-w-xs"
          />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={startUnknown}
              onCheckedChange={(v) => setStartUnknown(v === true)}
            />
            Not known yet — activate it later from the subscription
          </label>
          <p className="text-xs text-muted-foreground">
            {startUnknown
              ? "Nothing bills until someone activates it. Units can still be delivered."
              : startDate > today
                ? "Billing activates that morning and the first invoice goes out the same day."
                : "Billing activates now and the first invoice is raised today, covering the period from this date."}{" "}
            Selected units are assigned, not delivered — schedule the delivery in Dispatch.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending
              ? "Converting..."
              : `Start subscription${
                  selected.length > 0
                    ? ` with ${selected.length} unit${selected.length === 1 ? "" : "s"}`
                    : ""
                }`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
