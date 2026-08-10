import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserAreas } from "@/lib/authz";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { BigviewLogo } from "@/components/brand/logo";
import { logout } from "@/lib/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { areas } = await getUserAreas();

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-3 left-3 z-30 flex w-60 flex-col overflow-hidden rounded-2xl bg-sidebar text-sidebar-foreground shadow-lg">
        <div className="flex h-14 items-center justify-center border-b border-sidebar-border px-4">
          <BigviewLogo textClassName="text-lg text-white" />
        </div>

        <div className="flex flex-col items-center gap-1 border-b border-sidebar-border px-4 py-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-sidebar-accent bg-sidebar-accent text-lg font-semibold text-white">
            {initials(session.user.name ?? "?")}
          </div>
          <p className="mt-2 text-sm font-semibold text-white">
            {session.user.name}
          </p>
          <p className="text-xs text-sidebar-foreground/60">
            {session.user.role === "ADMIN" ? "Administrator" : "Team member"}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto py-4">
          <SidebarNav areas={areas} />
        </div>

        <div className="border-t border-sidebar-border p-3">
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
      </aside>

      <main className="ml-[16.5rem] flex-1">
        <div className="mx-auto max-w-7xl p-6">{children}</div>
      </main>
    </div>
  );
}
