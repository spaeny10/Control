import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { logout } from "@/lib/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-56 flex-col border-r bg-background">
        <div className="flex h-14 items-center border-b px-4">
          <span className="text-lg font-bold tracking-tight">
            BIGVIEW <span className="text-primary">Control</span>
          </span>
        </div>
        <div className="flex-1 overflow-y-auto py-4">
          <SidebarNav />
        </div>
        <div className="border-t p-3">
          <div className="mb-2 px-1">
            <p className="truncate text-sm font-medium">{session.user.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {session.user.email}
            </p>
          </div>
          <form action={logout}>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2"
              type="submit"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <main className="ml-56 flex-1 bg-muted/30">
        <div className="mx-auto max-w-7xl p-6">{children}</div>
      </main>
    </div>
  );
}
