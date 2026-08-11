/* No area guard here. These routes are redirect-only now, and they're reached
   from Fleet (a trailer's current site) as well as Sales — guarding on SALES
   would block a fleet user before the redirect could send them somewhere they
   can actually see. Every destination enforces its own area. */
export default function AreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
