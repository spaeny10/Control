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
import { toast } from "sonner";
import { X } from "lucide-react";

export type PriceRow = {
  planProductId: string;
  name: string;
  kind: "RECURRING_MONTHLY" | "ONE_TIME";
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

  function save(row: PriceRow) {
    const value = parseFloat(drafts[row.planProductId] ?? "");
    if (isNaN(value) || value < 0) {
      toast.error("Enter a valid price");
      return;
    }
    startTransition(async () => {
      const result = await setCompanyPrice(
        companyId,
        row.planProductId,
        value
      );
      if (result.ok) {
        toast.success(`${row.name} priced at ${formatCurrency(value)} for this company`);
        setDrafts((d) => ({ ...d, [row.planProductId]: "" }));
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
          Overrides the catalog price on quotes for this company/branch only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {rows.map((row) => (
            <div
              key={row.planProductId}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <div>
                <p className="font-medium">{row.name}</p>
                <p className="text-xs text-muted-foreground">
                  Catalog: {formatCurrency(row.defaultPrice)}
                  {row.kind === "RECURRING_MONTHLY" ? "/mo" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {row.overridePrice !== null && (
                  <>
                    <Badge>
                      {formatCurrency(row.overridePrice)}
                      {row.kind === "RECURRING_MONTHLY" ? "/mo" : ""} here
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
                            row.planProductId
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
                  placeholder={row.overridePrice !== null ? "Change" : "Set price"}
                  className="w-28"
                  value={drafts[row.planProductId] ?? ""}
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [row.planProductId]: e.target.value,
                    }))
                  }
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending || !drafts[row.planProductId]}
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
