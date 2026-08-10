/* Planned-activities card for record detail pages. Server component:
   fetches open activities for the parent and the assignable users. */
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScheduleActivityDialog } from "./schedule-activity-dialog";
import { ActivityRow, type ActivityView } from "./activity-row";
import { formatDateTime } from "@/lib/format";
import type { ActivityParent } from "@/lib/actions/activity-actions";

export async function ActivitiesCard({
  parent,
  revalidate,
}: {
  parent: ActivityParent;
  revalidate: string;
}) {
  const session = await auth();
  const [activities, users] = await Promise.all([
    prisma.activity.findMany({
      where: { ...parent, done: false },
      orderBy: { dueDate: "asc" },
      include: { assignee: { select: { name: true } } },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const now = new Date();
  const views: ActivityView[] = activities.map((a) => ({
    id: a.id,
    type: a.type,
    title: a.title,
    notes: a.notes,
    dueLabel: formatDateTime(a.dueDate),
    overdue: a.dueDate < now,
    assigneeName: a.assignee?.name ?? null,
  }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">
          Planned activities ({views.length})
        </CardTitle>
        <ScheduleActivityDialog
          parent={parent}
          revalidate={revalidate}
          users={users}
          currentUserId={session?.user?.id ?? ""}
        />
      </CardHeader>
      <CardContent>
        {views.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing planned. Schedule the next touchpoint so it doesn&apos;t
            slip.
          </p>
        ) : (
          <div className="divide-y">
            {views.map((a) => (
              <ActivityRow key={a.id} activity={a} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
