import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata = { title: "Invoices" };

export default function InvoicesPage() {
  return (
    <ComingSoon
      title="Invoices"
      description="Invoice statuses synced from Stripe"
      phase="Phase 5"
    />
  );
}
