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
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/sales", label: "Sales", icon: BadgeDollarSign },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/contacts", label: "Contacts", icon: Contact },
  { href: "/projects", label: "Projects", icon: HardHat },
  { href: "/quotes", label: "Quotes", icon: FileText },
  { href: "/subscriptions", label: "Subscriptions", icon: Repeat },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/fleet", label: "Fleet", icon: Truck },
  { href: "/dispatch", label: "Dispatch", icon: CalendarDays },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 px-3">
      {navItems.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
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
      })}
    </nav>
  );
}
