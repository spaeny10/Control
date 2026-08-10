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
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
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
        startDate,
      });
      if (result.ok) {
        toast.success("Subscription started");
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

        <div className="max-w-xs space-y-2">
          <Label htmlFor="startDate">Start date</Label>
          <Input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
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
