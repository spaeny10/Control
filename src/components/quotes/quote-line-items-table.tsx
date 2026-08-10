import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { CYCLE_LABELS, CYCLE_SUFFIX } from "@/lib/cycles";
import type { QuoteTotals } from "@/lib/quote-utils";
import type { BillingCycle } from "@prisma/client";

type LineItem = {
  id: string;
  cycle: BillingCycle;
  description: string;
  quantity: number;
  unitPrice: unknown;
};

export function QuoteLineItemsTable({
  lineItems,
  totals,
}: {
  lineItems: LineItem[];
  totals: QuoteTotals;
}) {
  const recurringCycles = Object.keys(totals.recurring) as BillingCycle[];

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead>Billing</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Unit price</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lineItems.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.description}</TableCell>
              <TableCell>
                <Badge variant="outline">{CYCLE_LABELS[item.cycle]}</Badge>
              </TableCell>
              <TableCell className="text-right">{item.quantity}</TableCell>
              <TableCell className="text-right">
                {formatCurrency(Number(item.unitPrice))}
              </TableCell>
              <TableCell className="text-right font-medium">
                {formatCurrency(item.quantity * Number(item.unitPrice))}
                {CYCLE_SUFFIX[item.cycle] && (
                  <span className="text-muted-foreground">
                    {CYCLE_SUFFIX[item.cycle]}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex flex-col items-end gap-1 border-t p-4 text-sm">
        {recurringCycles.map((cycle) => (
          <p key={cycle}>
            <span className="text-muted-foreground">
              {CYCLE_LABELS[cycle]} recurring:{" "}
            </span>
            <span className="font-semibold">
              {formatCurrency(totals.recurring[cycle] ?? 0)}
              {CYCLE_SUFFIX[cycle]}
            </span>
          </p>
        ))}
        {totals.oneTime > 0 && (
          <p>
            <span className="text-muted-foreground">One-time charges: </span>
            <span className="font-semibold">
              {formatCurrency(totals.oneTime)}
            </span>
          </p>
        )}
        {totals.monthlyEquivalent > 0 &&
          recurringCycles.some((c) => c !== "MONTHLY") && (
            <p className="text-xs text-muted-foreground">
              ≈ {formatCurrency(totals.monthlyEquivalent)}/mo equivalent
            </p>
          )}
        <p className="text-base">
          <span className="text-muted-foreground">First invoice total: </span>
          <span className="font-bold">
            {formatCurrency(totals.firstInvoice)}
          </span>
        </p>
      </div>
    </div>
  );
}
