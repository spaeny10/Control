import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getUserAreas } from "@/lib/authz";
import { SidebarContent } from "@/components/layout/sidebar-content";
import { MobileNav } from "@/components/layout/mobile-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { areas } = await getUserAreas();

  const sidebar = (
    <SidebarContent
      areas={areas}
      name={session.user.name ?? "?"}
      role={session.user.role}
      showLogo={false}
    />
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop rail */}
      <aside className="fixed inset-y-3 left-3 z-30 hidden w-60 flex-col overflow-hidden rounded-2xl bg-sidebar text-sidebar-foreground shadow-lg lg:flex">
        <SidebarContent
          areas={areas}
          name={session.user.name ?? "?"}
          role={session.user.role}
        />
      </aside>

      {/* Mobile top bar + drawer */}
      <MobileNav>{sidebar}</MobileNav>

      <main className="flex-1 lg:ml-[16.5rem]">
        <div className="mx-auto max-w-7xl p-4 sm:p-6">{children}</div>
      </main>
    </div>
  );
}
