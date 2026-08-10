import { requireArea } from "@/lib/authz";

// Access guard: this whole section requires the SALES area.
export default async function AreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireArea("SALES");
  return children;
}
