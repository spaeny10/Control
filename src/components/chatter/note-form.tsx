"use client";

import { useRef, useTransition } from "react";
import { addNote, type ChatterParent } from "@/lib/actions/message-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function NoteForm({
  parent,
  revalidate,
}: {
  parent: ChatterParent;
  revalidate: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      action={(formData) => {
        startTransition(async () => {
          const result = await addNote(parent, revalidate, formData);
          if (result.ok) {
            formRef.current?.reset();
          } else {
            toast.error(result.error ?? "Failed to add note");
          }
        });
      }}
      className="space-y-2"
    >
      <Textarea
        name="body"
        placeholder="Log a note..."
        rows={2}
        required
        className="resize-none"
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving..." : "Log note"}
        </Button>
      </div>
    </form>
  );
}
