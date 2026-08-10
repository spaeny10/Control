import Link from "next/link";
import { cn } from "@/lib/utils";

/* Server-rendered filter pills driven by a searchParam. The "all" option
   omits the param entirely. */
export function FilterPills({
  basePath,
  param,
  current,
  options,
  keepParams = {},
}: {
  basePath: string;
  param: string;
  current: string | undefined;
  options: { value: string; label: string; count?: number }[];
  keepParams?: Record<string, string | undefined>;
}) {
  function hrefFor(value: string | null) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(keepParams)) {
      if (v) params.set(k, v);
    }
    if (value) params.set(param, value);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const pills = [{ value: null as string | null, label: "All" }, ...options];

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-card p-1">
      {pills.map((pill) => {
        const active =
          pill.value === null ? !current : current === pill.value;
        return (
          <Link
            key={pill.value ?? "__all"}
            href={hrefFor(pill.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {pill.label}
            {"count" in pill && pill.count !== undefined && (
              <span className="ml-1 text-xs opacity-70">{pill.count}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
