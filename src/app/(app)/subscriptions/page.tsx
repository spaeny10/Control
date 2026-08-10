import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata = { title: "Subscriptions" };

export default function SubscriptionsPage() {
  return (
    <ComingSoon
      title="Subscriptions"
      description="Active rentals and recurring billing, synced with Stripe"
      phase="Phase 5"
    />
  );
}
