import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChevronRight } from "lucide-react";
import type { ProspectingFunnel } from "@/lib/kpi";

/* Organization prospecting, as a funnel of counts. Deliberately carries no
   dollar figure — a relationship has no job behind it yet. Reps get credit
   through the sourced-project-leads line instead, which is a real number and
   never double-counts: the MRR it refers to is reported once, on the project
   pipeline, where it actually is. */
export function ProspectingCard({
  funnel,
  ownerId,
}: {
  funnel: ProspectingFunnel;
  /** Keeps the rep filter when drilling through to the leads board. */
  ownerId?: string;
}) {
  const stages = [
    { label: "Unqualified", value: funnel.unqualified, stage: "UNQUALIFIED" },
    { label: "Contacted", value: funnel.contacted, stage: "CONTACTED" },
    { label: "Qualified", value: funnel.qualified, stage: "QUALIFIED" },
    {
      label: "Approved vendors",
      value: funnel.approvedVendors,
      stage: "WON",
    },
  ];

  if (stages.every((s) => s.value === 0)) return null;

  function href(stage: string) {
    const params = new URLSearchParams({
      track: "NEW_COMPANY",
      view: "list",
      stage,
    });
    if (ownerId) params.set("owner", ownerId);
    return `/leads?${params.toString()}`;
  }

  const showRate =
    funnel.winRate !== null && funnel.wonInWindow + funnel.lostInWindow >= 5;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Organization prospecting</CardTitle>
        <CardDescription>
          Relationship work, reported by count and stage. These leads carry no
          revenue forecast — they become revenue when they spawn a project lead.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
          {stages.map((s, i) => (
            <div key={s.stage} className="flex items-center gap-2">
              <Link
                href={href(s.stage)}
                className="rounded-md px-2 py-1 transition-colors hover:bg-muted"
              >
                <span className="block text-xl font-semibold leading-tight">
                  {s.value}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {s.label}
                </span>
              </Link>
              {i < stages.length - 1 && (
                <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
              )}
            </div>
          ))}
        </div>
        <p className="pt-3 text-xs text-muted-foreground">
          {funnel.sourcedProjectLeads} project lead
          {funnel.sourcedProjectLeads === 1 ? "" : "s"} sourced from these
          relationships
          {showRate &&
            `, ${funnel.winRate}% of closed organization leads approved`}
          .
        </p>
      </CardContent>
    </Card>
  );
}
