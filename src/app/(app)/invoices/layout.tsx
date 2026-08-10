import { requireArea } from "@/lib/authz";

// Access guard: this whole section requires the ACCOUNTING area.
export default async function AreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireArea("ACCOUNTING");
  return children;
}
