import { SidebarNav } from "@/components/layout/sidebar-nav";
import { BigviewLogo } from "@/components/brand/logo";
import { logout } from "@/lib/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import type { AppArea } from "@prisma/client";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/* The sidebar's inner content, shared by the desktop rail and the mobile
   drawer so there's a single source of truth for navigation. */
export function SidebarContent({
  areas,
  name,
  role,
  showLogo = true,
}: {
  areas: AppArea[];
  name: string;
  role: string;
  showLogo?: boolean;
}) {
  return (
    <>
      {showLogo && (
        <div className="flex h-14 shrink-0 items-center justify-center border-b border-sidebar-border px-4">
          <BigviewLogo textClassName="text-lg text-white" />
        </div>
      )}

      <div className="flex shrink-0 flex-col items-center gap-1 border-b border-sidebar-border px-4 py-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-sidebar-accent bg-sidebar-accent text-lg font-semibold text-white">
          {initials(name)}
        </div>
        <p className="mt-2 text-sm font-semibold text-white">{name}</p>
        <p className="text-xs text-sidebar-foreground/60">
          {role === "ADMIN" ? "Administrator" : "Team member"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <SidebarNav areas={areas} isAdmin={role === "ADMIN"} />
      </div>

      <div className="shrink-0 border-t border-sidebar-border p-3">
        <form action={logout}>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white"
            type="submit"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </form>
      </div>
    </>
  );
}
