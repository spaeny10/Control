import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { AppArea } from "@prisma/client";

export const AREA_LABELS: Record<AppArea, string> = {
  SALES: "Sales",
  FLEET: "Fleet",
  ACCOUNTING: "Accounting",
  TECH_ADMIN: "Technical Admin",
};

export const ALL_AREAS: AppArea[] = [
  "SALES",
  "FLEET",
  "ACCOUNTING",
  "TECH_ADMIN",
];

// Areas are read fresh from the DB (not the JWT) so grants apply without
// re-login. ADMINs implicitly have every area.
export async function getUserAreas(): Promise<{
  userId: string;
  isAdmin: boolean;
  areas: AppArea[];
}> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === "ADMIN") {
    return { userId: session.user.id, isAdmin: true, areas: ALL_AREAS };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { areas: true },
  });
  return {
    userId: session.user.id,
    isAdmin: false,
    areas: user?.areas ?? [],
  };
}

// Page guard: redirects to the dashboard when the user lacks the area.
export async function requireArea(area: AppArea) {
  const access = await getUserAreas();
  if (!access.areas.includes(area)) redirect("/");
  return access;
}
