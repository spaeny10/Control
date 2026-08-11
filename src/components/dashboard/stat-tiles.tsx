import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

export type StatTile = {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  /** Tailwind classes for the icon chip, e.g. "bg-[#2a78d6]/10 text-[#2a78d6]". */
  tint: string;
};

/* The KPI tile row shared by all three role dashboards. */
export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardContent className="flex items-center gap-3 pt-6">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tile.tint}`}
            >
              <tile.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-muted-foreground">
                {tile.label}
              </p>
              <p className="text-xl font-bold tracking-tight">{tile.value}</p>
              {tile.sub && (
                <p className="truncate text-xs text-muted-foreground">
                  {tile.sub}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
