"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BigviewLogo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";

/* Mobile top bar + slide-in drawer. Shown below the lg breakpoint; the
   desktop rail takes over above it. Receives the sidebar content as a child
   so navigation stays server-rendered. */
export function MobileNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation so tapping a link doesn't leave the drawer open.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock background scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-card px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="-ml-2 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Menu className="h-5 w-5" />
        </button>
        <BigviewLogo textClassName="text-base" />
      </header>

      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      {/* Drawer — inline transform rather than translate utilities, which
          don't reliably override each other under Tailwind v4. */}
      <aside
        style={{
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 200ms ease",
        }}
        className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground shadow-xl lg:hidden"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
          <BigviewLogo textClassName="text-lg text-white" />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="rounded-lg p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}
