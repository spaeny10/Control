import Link from "next/link";
import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";
import { statusBadgeVariant } from "@/lib/badges";
import { stageLabel } from "@/lib/lead-tracks";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { LeadStage, LeadType } from "@prisma/client";

export type LeadRow = {
  id: string;
  title: string;
  type: "NEW_COMPANY" | "NEW_PROJECT";
  stage: LeadStage;
  estMrr: number | null;
  estMonths: number | null;
  estValue: number | null;
  companyName: string | null;
  contactName: string | null;
  ownerName: string | null;
  source: string | null;
  expectedClose: Date | null;
  createdAt: Date;
};

export type SortKey =
  | "title"
  | "stage"
  | "mrr"
  | "value"
  | "close"
  | "created";

type ColumnKey =
  | "title"
  | "company"
  | "contact"
  | "stage"
  | "owner"
  | "mrr"
  | "months"
  | "value"
  | "source"
  | "close"
  | "created";

const COLUMN_META: Record<
  ColumnKey,
  { label: string; align?: "right"; sortKey?: SortKey }
> = {
  title: { label: "Lead", sortKey: "title" },
  company: { label: "Company" },
  contact: { label: "Contact" },
  stage: { label: "Stage", sortKey: "stage" },
  owner: { label: "Owner" },
  mrr: { label: "Est. MRR", align: "right", sortKey: "mrr" },
  months: { label: "Months" },
  value: { label: "Total value", align: "right", sortKey: "value" },
  source: { label: "Source" },
  close: { label: "Expected close", sortKey: "close" },
  created: { label: "Created", sortKey: "created" },
};

/* The organization track drops the money columns entirely — those values are
   always null there — and promotes Contact and Source, which are what actually
   matter when working a relationship. */
const TRACK_COLUMNS: Record<LeadType, ColumnKey[]> = {
  NEW_PROJECT: [
    "title",
    "company",
    "stage",
    "owner",
    "mrr",
    "months",
    "value",
    "close",
    "created",
  ],
  NEW_COMPANY: [
    "title",
    "company",
    "contact",
    "stage",
    "owner",
    "source",
    "close",
    "created",
  ],
};

export function LeadsTable({
  leads,
  track,
  sort,
  dir,
  hrefFor,
}: {
  leads: LeadRow[];
  track: LeadType;
  sort: SortKey;
  dir: "asc" | "desc";
  // Builds a sort link preserving the page's other params.
  hrefFor: (key: SortKey) => string;
}) {
  const columns = TRACK_COLUMNS[track];

  // One render map rather than two JSX bodies, so the sort-header logic below
  // isn't duplicated per track.
  const CELLS: Record<ColumnKey, (l: LeadRow) => ReactNode> = {
    title: (l) => (
      <Link href={`/leads/${l.id}`} className="font-medium hover:underline">
        {l.title}
      </Link>
    ),
    company: (l) => (
      <span className="text-muted-foreground">{l.companyName ?? "—"}</span>
    ),
    contact: (l) => (
      <span className="text-muted-foreground">{l.contactName ?? "—"}</span>
    ),
    stage: (l) => (
      <Badge variant={statusBadgeVariant(l.stage)}>
        {stageLabel(l.type, l.stage)}
      </Badge>
    ),
    owner: (l) => (
      <span className="text-muted-foreground">{l.ownerName ?? "—"}</span>
    ),
    mrr: (l) =>
      l.estMrr !== null ? `${formatCurrency(l.estMrr)}/mo` : "—",
    months: (l) => (
      <span className="text-muted-foreground">{l.estMonths ?? "—"}</span>
    ),
    value: (l) => (l.estValue !== null ? formatCurrency(l.estValue) : "—"),
    source: (l) => (
      <span className="text-muted-foreground">{l.source ?? "—"}</span>
    ),
    close: (l) => (
      <span className="text-muted-foreground">
        {formatDate(l.expectedClose)}
      </span>
    ),
    created: (l) => (
      <span className="text-muted-foreground">{formatDate(l.createdAt)}</span>
    ),
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((key) => {
            const col = COLUMN_META[key];
            return (
              <TableHead
                key={key}
                className={col.align === "right" ? "text-right" : undefined}
              >
                {col.sortKey ? (
                  <Link
                    href={hrefFor(col.sortKey)}
                    className={cn(
                      "inline-flex items-center gap-1 hover:text-foreground",
                      sort === col.sortKey && "font-semibold text-foreground"
                    )}
                  >
                    {col.label}
                    {sort === col.sortKey &&
                      (dir === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      ))}
                  </Link>
                ) : (
                  col.label
                )}
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={columns.length}
              className="py-8 text-center text-muted-foreground"
            >
              No leads match your filters.
            </TableCell>
          </TableRow>
        )}
        {leads.map((lead) => (
          <TableRow key={lead.id}>
            {columns.map((key) => (
              <TableCell
                key={key}
                className={cn(
                  COLUMN_META[key].align === "right" && "text-right",
                  key === "mrr" && "font-medium"
                )}
              >
                {CELLS[key](lead)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
