"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import {
  activateSubscriptionAction,
  scheduleActivation,
} from "@/lib/actions/subscription-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

/* Billing for a signed contract that hasn't started. Activation is its own
   decision — units may already be on site, or not yet delivered — so this
   says plainly what's on site and lets someone start billing now, pick the day
   it should start, or leave it until the GC says go. */
export function ActivationCard({
  subscriptionId,
  scheduledFor,
  unitsOnSite,
  unitsInYard,
  firstOnSite,
}: {
  subscriptionId: string;
  scheduledFor: string | null;
  unitsOnSite: number;
  unitsInYard: number;
  firstOnSite: string | null;
}) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [date, setDate] = useState(scheduledFor ?? today);
  const [isPending, startTransition] = useTransition();
  const future = date > today;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const r = await fn();
      if (r.ok) toast.success(ok);
      else toast.error(r.error ?? "Failed");
    });
  }

  return (
    <Card className="border-[#eb6834]/50">
      <CardHeader>
        <CardTitle className="text-base">Billing not started</CardTitle>
        <CardDescription>
          {unitsOnSite > 0
            ? `${unitsOnSite} unit${unitsOnSite === 1 ? " has" : "s have"} been on site since ${firstOnSite} without billing.`
            : unitsInYard > 0
              ? `${unitsInYard} unit${unitsInYard === 1 ? " is" : "s are"} assigned and waiting on a delivery.`
              : "No units assigned yet."}{" "}
          {scheduledFor
            ? `Billing is scheduled to start ${format(new Date(`${scheduledFor}T00:00:00`), "MMM d, yyyy")} — the first invoice goes out that day.`
            : "No start date set — billing waits until someone activates it."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="activation-date">Billing starts</Label>
            <Input
              id="activation-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-44"
            />
          </div>
          <Button
            disabled={isPending || !date}
            onClick={() =>
              run(
                () => activateSubscriptionAction(subscriptionId, date),
                future ? "Activation scheduled" : "Billing activated — first invoice raised"
              )
            }
          >
            {future ? "Schedule activation" : "Activate now"}
          </Button>
          {scheduledFor && (
            <Button
              variant="ghost"
              disabled={isPending}
              onClick={() =>
                run(
                  () => scheduleActivation(subscriptionId, null),
                  "Scheduled activation cleared"
                )
              }
            >
              Clear date
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {future
            ? "The billing run activates it that morning and raises the first invoice. Every later invoice goes out on the same day of the month."
            : "Activating raises the first invoice immediately, covering the period from this date. A past date backdates billing to it."}
        </p>
      </CardContent>
    </Card>
  );
}
