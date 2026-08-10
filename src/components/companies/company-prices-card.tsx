"use client";

import { useState, useTransition } from "react";
import {
  setCompanyPrice,
  removeCompanyPrice,
} from "@/lib/actions/company-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { CYCLE_LABELS, CYCLE_SUFFIX } from "@/lib/cycles";
import { toast } from "sonner";
import { X } from "lucide-react";
import type { BillingCycle } from "@prisma/client";

// One row per product x offered cycle.
export type PriceRow = {
  planProductId: string;
  name: string;
  cycle: BillingCycle;
  defaultPrice: number;
  overridePrice: number | null;
};

export function CompanyPricesCard({
  companyId,
  rows,
}: {
  companyId: string;
  rows: PriceRow[];
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  function rowKey(row: PriceRow) {
    return `${row.planProductId}:${row.cycle}`;
  }

  function save(row: PriceRow) {
    const value = parseFloat(drafts[rowKey(row)] ?? "");
    if (isNaN(value) || value < 0) {
      toast.error("Enter a valid price");
      return;
    }
    startTransition(async () => {
      const result = await setCompanyPrice(
        companyId,
        row.planProductId,
        row.cycle,
        value
      );
      if (result.ok) {
        toast.success(
          `${row.name} (${CYCLE_LABELS[row.cycle]}) set to ${formatCurrency(value)} here`
        );
        setDrafts((d) => ({ ...d, [rowKey(row)]: "" }));
      } else {
        toast.error(result.error ?? "Failed to save price");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Negotiated pricing</CardTitle>
        <CardDescription>
          Overrides the catalog price on quotes for this company/branch only,
          per billing cycle.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {rows.map((row) => (
            <div
              key={rowKey(row)}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <div>
                <p className="font-medium">
                  {row.name}{" "}
                  <Badge variant="outline" className="ml-1 text-[10px]">
                    {CYCLE_LABELS[row.cycle]}
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  Catalog: {formatCurrency(row.defaultPrice)}
                  {CYCLE_SUFFIX[row.cycle]}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {row.overridePrice !== null && (
                  <>
                    <Badge>
                      {formatCurrency(row.overridePrice)}
                      {CYCLE_SUFFIX[row.cycle]} here
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      title="Remove override"
                      onClick={() =>
                        startTransition(async () => {
                          const r = await removeCompanyPrice(
                            companyId,
                            row.planProductId,
                            row.cycle
                          );
                          if (r.ok) toast.success("Override removed");
                          else toast.error(r.error ?? "Failed");
                        })
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={
                    row.overridePrice !== null ? "Change" : "Set price"
                  }
                  className="w-28"
                  value={drafts[rowKey(row)] ?? ""}
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [rowKey(row)]: e.target.value,
                    }))
                  }
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending || !drafts[rowKey(row)]}
                  onClick={() => save(row)}
                >
                  Set
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
