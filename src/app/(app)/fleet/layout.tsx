import { requireArea } from "@/lib/authz";

// Access guard: this whole section requires the FLEET area.
export default async function AreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireArea("FLEET");
  return children;
}
