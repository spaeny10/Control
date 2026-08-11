"use client";

import { useRef, useState, useTransition } from "react";
import {
  addNote,
  sendChatterEmail,
  type ChatterParent,
} from "@/lib/actions/message-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { StickyNote, Mail } from "lucide-react";

/* Note vs Email composer. Email is only offered when Google Workspace is
   connected, so the UI never dangles an action that can't complete. */
export function ComposeForm({
  parent,
  revalidate,
  emailEnabled,
  defaultTo,
}: {
  parent: ChatterParent;
  revalidate: string;
  emailEnabled: boolean;
  defaultTo?: string | null;
}) {
  const [mode, setMode] = useState<"note" | "email">("note");
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  const tabs = [
    { key: "note" as const, label: "Note", icon: StickyNote },
    { key: "email" as const, label: "Email", icon: Mail },
  ];

  return (
    <div className="space-y-2">
      {emailEnabled && (
        <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setMode(tab.key)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                mode === tab.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <form
        ref={formRef}
        key={mode}
        action={(formData) => {
          startTransition(async () => {
            const result =
              mode === "email"
                ? await sendChatterEmail(parent, revalidate, formData)
                : await addNote(parent, revalidate, formData);
            if (result.ok) {
              if (mode === "email") toast.success("Email sent");
              formRef.current?.reset();
            } else {
              toast.error(result.error ?? "Something went wrong");
            }
          });
        }}
        className="space-y-2"
      >
        {mode === "email" && (
          <>
            <Input
              name="to"
              type="email"
              placeholder="Recipient email"
              defaultValue={defaultTo ?? ""}
              required
            />
            <Input name="subject" placeholder="Subject" required />
          </>
        )}
        <Textarea
          name="body"
          placeholder={
            mode === "email" ? "Write your message..." : "Log a note..."
          }
          rows={mode === "email" ? 4 : 2}
          required
          className="resize-none"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending
              ? mode === "email"
                ? "Sending..."
                : "Saving..."
              : mode === "email"
                ? "Send email"
                : "Log note"}
          </Button>
        </div>
      </form>
    </div>
  );
}
