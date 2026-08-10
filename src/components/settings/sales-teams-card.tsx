"use client";

import { useRef, useState, useTransition } from "react";
import {
  createSalesTeam,
  deleteSalesTeam,
  assignUserToTeam,
  setCommissionRate,
} from "@/lib/actions/sales-team-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

const NO_TEAM = "__none__";

export type TeamView = { id: string; name: string; memberCount: number };
export type RepView = {
  id: string;
  name: string;
  salesTeamId: string | null;
  commissionRate: number;
};

export function SalesTeamsCard({
  teams,
  reps,
}: {
  teams: TeamView[];
  reps: RepView[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sales teams</CardTitle>
          <CardDescription>
            Group reps into teams; the Sales page rolls commission up by team.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            ref={formRef}
            action={(formData) => {
              startTransition(async () => {
                const result = await createSalesTeam(formData);
                if (result.ok) {
                  toast.success("Team created");
                  formRef.current?.reset();
                } else {
                  toast.error(result.error ?? "Failed");
                }
              });
            }}
            className="flex items-center gap-2"
          >
            <Input
              name="name"
              placeholder="e.g. Florida East"
              required
              className="max-w-xs"
            />
            <Button type="submit" size="sm" disabled={isPending} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Add team
            </Button>
          </form>

          <div className="divide-y">
            {teams.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{t.name}</span>
                  <Badge variant="secondary">
                    {t.memberCount} member{t.memberCount === 1 ? "" : "s"}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await deleteSalesTeam(t.id);
                      if (r.ok) toast.success("Team deleted — members detached");
                      else toast.error(r.error ?? "Failed");
                    })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            ))}
            {teams.length === 0 && (
              <p className="py-2 text-sm text-muted-foreground">
                No teams yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reps & commission rates</CardTitle>
          <CardDescription>
            Commission is the rep&apos;s percentage of their attributed active
            MRR, paid monthly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {reps.map((rep) => (
              <div
                key={rep.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <span className="font-medium">{rep.name}</span>
                <div className="flex items-center gap-2">
                  <Select
                    value={rep.salesTeamId ?? NO_TEAM}
                    onValueChange={(v) =>
                      startTransition(async () => {
                        const r = await assignUserToTeam(
                          rep.id,
                          v === NO_TEAM ? null : v
                        );
                        if (r.ok) toast.success("Team updated");
                        else toast.error(r.error ?? "Failed");
                      })
                    }
                    disabled={isPending}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_TEAM}>No team</SelectItem>
                      {teams.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      className="w-20"
                      placeholder={String(rep.commissionRate)}
                      value={rateDrafts[rep.id] ?? ""}
                      onChange={(e) =>
                        setRateDrafts((d) => ({
                          ...d,
                          [rep.id]: e.target.value,
                        }))
                      }
                    />
                    <span className="text-muted-foreground">%</span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending || !rateDrafts[rep.id]}
                      onClick={() =>
                        startTransition(async () => {
                          const r = await setCommissionRate(
                            rep.id,
                            parseFloat(rateDrafts[rep.id])
                          );
                          if (r.ok) {
                            toast.success("Rate updated");
                            setRateDrafts((d) => ({ ...d, [rep.id]: "" }));
                          } else {
                            toast.error(r.error ?? "Failed");
                          }
                        })
                      }
                    >
                      Set
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
