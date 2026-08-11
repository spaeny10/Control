import { BigviewLogo } from "@/components/brand/logo";
import { WifiOff } from "lucide-react";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/40 p-6 text-center">
      <BigviewLogo textClassName="text-3xl" />
      <WifiOff className="h-10 w-10 text-muted-foreground" />
      <div>
        <h1 className="text-lg font-semibold">You&apos;re offline</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          BIGVIEW Control needs a connection to show live fleet and billing
          data. Anything you were viewing will reload once you&apos;re back on
          signal.
        </p>
      </div>
      {/* Full reload rather than client nav — the SW must retry the network. */}
      <a
        href="/"
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Try again
      </a>
    </div>
  );
}
