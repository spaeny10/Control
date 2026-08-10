import Link from "next/link";
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
import { cn } from "@/lib/utils";
import { Building2, HardHat, ArrowUp, ArrowDown } from "lucide-react";

export type LeadRow = {
  id: string;
  title: string;
  type: "NEW_COMPANY" | "NEW_PROJECT";
  stage: string;
  estMrr: number | null;
  estMonths: number | null;
  estValue: number | null;
  companyName: string | null;
  contactName: string | null;
  ownerName: string | null;
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

const COLUMNS: {
  key: SortKey | null;
  label: string;
  align?: "right";
}[] = [
  { key: "title", label: "Lead" },
  { key: null, label: "Company" },
  { key: "stage", label: "Stage" },
  { key: null, label: "Owner" },
  { key: "mrr", label: "Est. MRR", align: "right" },
  { key: null, label: "Months" },
  { key: "value", label: "Total value", align: "right" },
  { key: "close", label: "Expected close" },
  { key: "created", label: "Created" },
];

export function LeadsTable({
  leads,
  sort,
  dir,
  hrefFor,
}: {
  leads: LeadRow[];
  sort: SortKey;
  dir: "asc" | "desc";
  // Builds a sort link preserving the page's other params.
  hrefFor: (key: SortKey) => string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {COLUMNS.map((col) => (
            <TableHead
              key={col.label}
              className={col.align === "right" ? "text-right" : undefined}
            >
              {col.key ? (
                <Link
                  href={hrefFor(col.key)}
                  className={cn(
                    "inline-flex items-center gap-1 hover:text-foreground",
                    sort === col.key && "font-semibold text-foreground"
                  )}
                >
                  {col.label}
                  {sort === col.key &&
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
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {leads.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={COLUMNS.length}
              className="py-8 text-center text-muted-foreground"
            >
              No leads match your filters.
            </TableCell>
          </TableRow>
        )}
        {leads.map((lead) => (
          <TableRow key={lead.id}>
            <TableCell>
              <Link
                href={`/leads/${lead.id}`}
                className="font-medium hover:underline"
              >
                {lead.title}
              </Link>
              <Badge variant="outline" className="ml-2 gap-1 px-1 text-[10px]">
                {lead.type === "NEW_COMPANY" ? (
                  <Building2 className="h-3 w-3" />
                ) : (
                  <HardHat className="h-3 w-3" />
                )}
                {lead.type === "NEW_COMPANY" ? "New co." : "New project"}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {lead.companyName ?? "—"}
              {lead.contactName && (
                <span className="block text-xs">{lead.contactName}</span>
              )}
            </TableCell>
            <TableCell>
              <Badge variant={statusBadgeVariant(lead.stage)}>
                {lead.stage.replace("_", " ")}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {lead.ownerName ?? "—"}
            </TableCell>
            <TableCell className="text-right font-medium">
              {lead.estMrr !== null ? `${formatCurrency(lead.estMrr)}/mo` : "—"}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {lead.estMonths ?? "—"}
            </TableCell>
            <TableCell className="text-right">
              {lead.estValue !== null ? formatCurrency(lead.estValue) : "—"}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(lead.expectedClose)}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(lead.createdAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
