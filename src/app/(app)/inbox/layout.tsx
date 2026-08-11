import { requireArea } from "@/lib/authz";

// Access guard: this whole section requires the SALES area. The page itself
// additionally restricts the team-wide view to admins.
export default async function AreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireArea("SALES");
  return children;
}
