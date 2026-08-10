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

type LineItem = {
  id: string;
  kind: string;
  description: string;
  quantity: number;
  unitPrice: unknown;
};

export function QuoteLineItemsTable({
  lineItems,
  totals,
}: {
  lineItems: LineItem[];
  totals: { monthly: number; oneTime: number; firstInvoice: number };
}) {
  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead>Type</TableHead>
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
                <Badge variant="outline">
                  {item.kind === "RECURRING_MONTHLY" ? "Monthly" : "One-time"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{item.quantity}</TableCell>
              <TableCell className="text-right">
                {formatCurrency(Number(item.unitPrice))}
              </TableCell>
              <TableCell className="text-right font-medium">
                {formatCurrency(item.quantity * Number(item.unitPrice))}
                {item.kind === "RECURRING_MONTHLY" && (
                  <span className="text-muted-foreground">/mo</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex flex-col items-end gap-1 border-t p-4 text-sm">
        {totals.monthly > 0 && (
          <p>
            <span className="text-muted-foreground">Monthly recurring: </span>
            <span className="font-semibold">
              {formatCurrency(totals.monthly)}/mo
            </span>
          </p>
        )}
        {totals.oneTime > 0 && (
          <p>
            <span className="text-muted-foreground">One-time charges: </span>
            <span className="font-semibold">
              {formatCurrency(totals.oneTime)}
            </span>
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
