"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  BadgeDollarSign,
  Building2,
  Contact,
  HardHat,
  FileText,
  Repeat,
  Receipt,
  Truck,
  CalendarDays,
  Settings,
  UserCircle,
} from "lucide-react";
import type { AppArea } from "@prisma/client";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const SECTIONS: { area: AppArea; label: string; items: NavItem[] }[] = [
  {
    area: "SALES",
    label: "Sales",
    items: [
      { href: "/leads", label: "Leads", icon: Users },
      { href: "/quotes", label: "Quotes", icon: FileText },
      { href: "/companies", label: "Companies", icon: Building2 },
      { href: "/contacts", label: "Contacts", icon: Contact },
      { href: "/projects", label: "Projects", icon: HardHat },
      { href: "/sales", label: "Commissions", icon: BadgeDollarSign },
    ],
  },
  {
    area: "FLEET",
    label: "Fleet",
    items: [
      { href: "/fleet", label: "Trailers", icon: Truck },
      { href: "/dispatch", label: "Dispatch", icon: CalendarDays },
    ],
  },
  {
    area: "ACCOUNTING",
    label: "Accounting",
    items: [
      { href: "/subscriptions", label: "Subscriptions", icon: Repeat },
      { href: "/invoices", label: "Invoices", icon: Receipt },
    ],
  },
  {
    area: "TECH_ADMIN",
    label: "Technical Admin",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white"
      )}
    >
      <item.icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

export function SidebarNav({ areas }: { areas: AppArea[] }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const hasTechAdmin = areas.includes("TECH_ADMIN");

  return (
    <nav className="flex flex-col gap-1 px-3">
      <NavLink
        item={{ href: "/", label: "Dashboard", icon: LayoutDashboard }}
        active={isActive("/")}
      />

      {SECTIONS.filter((s) => areas.includes(s.area)).map((section) => (
        <div key={section.area} className="mt-3">
          <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
            {section.label}
          </p>
          <div className="flex flex-col gap-1">
            {section.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(item.href)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Everyone can reach their own account settings even without the
          Technical Admin area. */}
      {!hasTechAdmin && (
        <div className="mt-3">
          <NavLink
            item={{ href: "/settings", label: "My account", icon: UserCircle }}
            active={isActive("/settings")}
          />
        </div>
      )}
    </nav>
  );
}
