"use client";

import { useRef, useTransition } from "react";
import {
  startWatchingMailbox,
  stopWatchingMailbox,
  armWatchesForActiveReps,
} from "@/lib/actions/gmail-admin-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

export type MailboxView = {
  id: string;
  emailAddress: string;
  isActive: boolean;
  watchExpiration: string | null;
  /** True when the Gmail watch has lapsed — inbound has silently stopped. */
  expired: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
};

export function GmailMailboxesCard({
  mailboxes,
  configured,
}: {
  mailboxes: MailboxView[];
  configured: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Inbound email mailboxes</CardTitle>
        <CardDescription>
          Mailboxes the app watches for customer replies. Only replies on
          threads the app itself sent are imported — other mail is never read
          or stored.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!configured && (
          <p className="rounded-md border border-[#eb6834]/40 bg-[#eb6834]/5 p-2 text-xs text-muted-foreground">
            Connect Google Workspace first (service account key and Pub/Sub
            topic) — then mailboxes can be watched.
          </p>
        )}

        <form
          ref={formRef}
          action={(formData) => {
            startTransition(async () => {
              const result = await startWatchingMailbox(formData);
              if (result.ok) {
                toast.success("Watching mailbox");
                formRef.current?.reset();
              } else {
                toast.error(result.error ?? "Failed");
              }
            });
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <Input
            name="emailAddress"
            type="email"
            placeholder="rentals@bigview.ai"
            className="max-w-xs"
            required
            disabled={!configured}
          />
          <Button
            type="submit"
            size="sm"
            className="gap-1"
            disabled={isPending || !configured}
          >
            <Plus className="h-3.5 w-3.5" /> Watch mailbox
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending || !configured}
            onClick={() =>
              startTransition(async () => {
                const result = await armWatchesForActiveReps();
                if (result.ok) {
                  // A partial success returns ok with a message.
                  if (result.error) toast.warning(result.error);
                  else toast.success("Watching all active sales mailboxes");
                } else {
                  toast.error(result.error ?? "Failed");
                }
              })
            }
          >
            Arm all sales reps
          </Button>
        </form>

        <div className="divide-y">
          {mailboxes.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">
              No mailboxes watched yet.
            </p>
          )}
          {mailboxes.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <div>
                <p className="font-medium">{m.emailAddress}</p>
                <p className="text-xs text-muted-foreground">
                  {m.lastSyncedAt
                    ? `Last sync ${m.lastSyncedAt}`
                    : "Not synced yet"}
                  {m.watchExpiration && ` · watch until ${m.watchExpiration}`}
                </p>
                {m.lastError && (
                  <p className="text-xs text-destructive">{m.lastError}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!m.isActive ? (
                  <Badge variant="outline">Paused</Badge>
                ) : m.expired ? (
                  // A lapsed watch means Gmail stopped publishing silently —
                  // the most important failure to surface here.
                  <Badge variant="destructive">Watch expired</Badge>
                ) : (
                  <Badge>Active</Badge>
                )}
                {m.isActive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    title="Stop watching"
                    onClick={() =>
                      startTransition(async () => {
                        const r = await stopWatchingMailbox(m.id);
                        if (r.ok) toast.success("Stopped watching");
                        else toast.error(r.error ?? "Failed");
                      })
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
