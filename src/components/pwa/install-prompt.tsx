"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "bigview-install-dismissed";

/* Subtle install affordance. Only appears when the browser says the app is
   installable, and stays dismissed once the user says no. */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;
    const handler = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!event) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-xl border bg-card p-3 shadow-lg lg:left-auto lg:right-6">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Download className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Install BIGVIEW Control</p>
        <p className="text-xs text-muted-foreground">
          Add it to your home screen for full-screen access.
        </p>
      </div>
      <Button
        size="sm"
        onClick={async () => {
          await event.prompt();
          await event.userChoice;
          setEvent(null);
        }}
      >
        Install
      </Button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, "1");
          setEvent(null);
        }}
        className="rounded p-1 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
