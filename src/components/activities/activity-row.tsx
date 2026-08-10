"use client";

import { useTransition } from "react";
import Link from "next/link";
import {
  completeActivity,
  deleteActivity,
} from "@/lib/actions/activity-actions";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Phone,
  Mail,
  Users,
  ClipboardCheck,
  MapPin,
  Trash2,
} from "lucide-react";
import type { ActivityType } from "@prisma/client";

const typeIcons: Record<ActivityType, React.ComponentType<{ className?: string }>> = {
  CALL: Phone,
  EMAIL: Mail,
  MEETING: Users,
  TASK: ClipboardCheck,
  SITE_VISIT: MapPin,
};

export type ActivityView = {
  id: string;
  type: ActivityType;
  title: string;
  notes: string | null;
  dueLabel: string;
  overdue: boolean;
  assigneeName: string | null;
  // Optional link to the parent record (used on the dashboard list)
  parentHref?: string;
  parentLabel?: string;
};

export function ActivityRow({ activity }: { activity: ActivityView }) {
  const [isPending, startTransition] = useTransition();
  const Icon = typeIcons[activity.type];

  return (
    <div
      className={cn(
        "flex items-start gap-3 py-2",
        isPending && "opacity-50"
      )}
    >
      <Checkbox
        className="mt-0.5"
        disabled={isPending}
        onCheckedChange={() =>
          startTransition(async () => {
            const result = await completeActivity(activity.id);
            if (result.ok) toast.success("Marked done");
            else toast.error(result.error ?? "Failed");
          })
        }
      />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          {activity.title}
          {activity.parentHref && (
            <Link
              href={activity.parentHref}
              className="text-xs font-normal text-primary hover:underline"
            >
              {activity.parentLabel}
            </Link>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          <Badge
            variant={activity.overdue ? "destructive" : "secondary"}
            className="mr-1.5 px-1 text-[10px]"
          >
            {activity.dueLabel}
          </Badge>
          {activity.assigneeName}
          {activity.notes && ` · ${activity.notes}`}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        disabled={isPending}
        title="Delete activity"
        onClick={() =>
          startTransition(async () => {
            const result = await deleteActivity(activity.id);
            if (!result.ok) toast.error(result.error ?? "Failed");
          })
        }
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
    </div>
  );
}
