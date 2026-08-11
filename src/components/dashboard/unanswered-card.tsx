import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { UnansweredThread } from "@/lib/email-oversight";

/* Customers waiting on a reply. Ordered longest-waiting first, since that's
   the triage order. Threads owned by a deactivated rep are called out —
   that's the departure handoff signal. */
export function UnansweredCard({
  threads,
  showRep,
}: {
  threads: UnansweredThread[];
  /** Admins see whose thread it is; a member only sees their own. */
  showRep: boolean;
}) {
  if (threads.length === 0) return null;

  const stale = threads.filter((t) => t.daysWaiting >= 2).length;

  return (
    <Card className={cn(stale > 0 && "border-destructive/50")}>
      <CardHeader>
        <CardTitle className="text-base">
          Waiting on a reply ({threads.length})
        </CardTitle>
        <CardDescription>
          {stale > 0
            ? `${stale} ${stale === 1 ? "customer has" : "customers have"} been waiting 2+ days.`
            : "Customers who replied and haven't heard back yet."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {threads.slice(0, 10).map((thread) => (
            <div
              key={thread.threadId}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {thread.href ? (
                    <Link href={thread.href} className="hover:underline">
                      {thread.customer ?? "Unknown customer"}
                    </Link>
                  ) : (
                    (thread.customer ?? "Unknown customer")
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {thread.subject ?? "(no subject)"} ·{" "}
                  {formatDateTime(thread.lastInboundAt)}
                  {showRep && thread.repName && ` · ${thread.repName}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!thread.repActive && (
                  <Badge variant="outline">Rep deactivated</Badge>
                )}
                <Badge
                  variant={thread.daysWaiting >= 2 ? "destructive" : "secondary"}
                >
                  {thread.daysWaiting === 0
                    ? "today"
                    : `${thread.daysWaiting}d`}
                </Badge>
              </div>
            </div>
          ))}
        </div>
        {threads.length > 10 && (
          <p className="pt-2 text-xs text-muted-foreground">
            Showing the 10 longest-waiting of {threads.length}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
