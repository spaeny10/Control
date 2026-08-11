import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StalledQuoteLead } from "@/lib/quote-oversight";

const REASON_LABEL: Record<StalledQuoteLead["reason"], string> = {
  declined: "Declined",
  expired: "Expired",
  lapsed: "Lapsed",
};

/* Leads still sitting at Quote sent with nothing live. Nothing auto-closes
   these — a decline often means "not at that price" — so this is the queue
   where a rep decides to re-quote or call it lost. */
export function StalledQuotesCard({
  leads,
  showRep,
}: {
  leads: StalledQuoteLead[];
  /** Admins see whose lead it is; a member only sees their own. */
  showRep: boolean;
}) {
  if (leads.length === 0) return null;

  // Longer fuse than the email card: a dead quote isn't rude, just stale.
  const stale = leads.filter((l) => l.daysStalled >= 7).length;

  return (
    <Card className={cn(stale > 0 && "border-destructive/50")}>
      <CardHeader>
        <CardTitle className="text-base">
          Quotes needing a decision ({leads.length})
        </CardTitle>
        <CardDescription>
          Still at Quote sent with nothing live in front of the customer.
          Re-quote, or mark the lead lost — they stay in the forecast until you
          do.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {leads.slice(0, 10).map((lead) => (
            <div
              key={lead.leadId}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  <Link
                    href={`/leads/${lead.leadId}`}
                    className="hover:underline"
                  >
                    {lead.title}
                  </Link>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {lead.quoteNumber}
                  {lead.company && ` · ${lead.company}`} ·{" "}
                  {formatDate(lead.deadSince)}
                  {showRep && lead.repName && ` · ${lead.repName}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {lead.estMrr !== null && (
                  <span className="text-xs text-muted-foreground">
                    {formatCurrency(lead.estMrr)}/mo
                  </span>
                )}
                {!lead.repActive && (
                  <Badge variant="outline">Rep deactivated</Badge>
                )}
                <Badge
                  variant={
                    lead.reason === "declined" ? "destructive" : "outline"
                  }
                >
                  {REASON_LABEL[lead.reason]}
                </Badge>
                <Badge variant={lead.daysStalled >= 7 ? "destructive" : "secondary"}>
                  {lead.daysStalled === 0 ? "today" : `${lead.daysStalled}d`}
                </Badge>
              </div>
            </div>
          ))}
        </div>
        {leads.length > 10 && (
          <p className="pt-2 text-xs text-muted-foreground">
            Showing the 10 longest-stalled of {leads.length}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
