import { calendar as calendarApi } from "@googleapis/calendar";
import { prisma } from "@/lib/prisma";
import {
  GOOGLE_SCOPES,
  getGoogleClient,
  isGoogleConfigured,
  tryGoogle,
} from "./client";

/* One-way calendar sync: the app is the source of truth and pushes events to
   the assignee's Google Calendar. Nothing reads back from Google.

   Every function is failure-isolated (tryGoogle) and returns null rather than
   throwing — a calendar problem must never roll back the dispatch or activity
   write that triggered it. */

const SHARED_CALENDAR_ID = process.env.GOOGLE_SHARED_CALENDAR_ID;

function appUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}${path}`;
}

// Both DispatchJob.scheduledFor and Activity.dueDate are single instants, but
// Google needs start+end — so duration is derived from the kind of work.
const JOB_MINUTES: Record<string, number> = {
  DELIVERY: 120,
  PICKUP: 90,
  SERVICE: 60,
};
const ACTIVITY_MINUTES: Record<string, number> = {
  CALL: 30,
  EMAIL: 15,
  MEETING: 60,
  TASK: 30,
  SITE_VISIT: 90,
};

function endTime(start: Date, minutes: number) {
  return new Date(start.getTime() + minutes * 60_000);
}

type EventTarget = {
  /** Mailbox whose calendar the event belongs on. */
  organizerEmail: string | null;
  summary: string;
  description: string;
  location?: string | null;
  start: Date;
  end: Date;
};

async function writeEvent(
  target: EventTarget,
  existingEventId: string | null
): Promise<string | null> {
  if (!isGoogleConfigured()) return null;

  // No assignee: fall back to a shared team calendar if one is configured,
  // otherwise there's nowhere sensible to put it.
  const owner = target.organizerEmail;
  const calendarId = owner ? "primary" : SHARED_CALENDAR_ID;
  const impersonate = owner ?? process.env.GOOGLE_DRIVE_OWNER ?? null;
  if (!calendarId || !impersonate) return null;

  const auth = getGoogleClient(impersonate, GOOGLE_SCOPES.calendar);
  if (!auth) return null;
  const api = calendarApi({ version: "v3", auth });

  const requestBody = {
    summary: target.summary,
    description: target.description,
    location: target.location ?? undefined,
    start: { dateTime: target.start.toISOString() },
    end: { dateTime: target.end.toISOString() },
    source: { title: "BIGVIEW Control", url: appUrl("/dispatch") },
  };

  return tryGoogle("calendar.write", async () => {
    if (existingEventId) {
      try {
        const updated = await api.events.update({
          calendarId,
          eventId: existingEventId,
          requestBody,
        });
        return updated.data.id ?? null;
      } catch (err) {
        // The event may have been deleted in Google; fall through to insert
        // so the app self-heals instead of failing forever.
        const status = (err as { code?: number })?.code;
        if (status !== 404 && status !== 410) throw err;
      }
    }
    const created = await api.events.insert({ calendarId, requestBody });
    return created.data.id ?? null;
  });
}

async function removeEvent(
  organizerEmail: string | null,
  eventId: string | null
): Promise<void> {
  if (!eventId || !isGoogleConfigured()) return;

  const calendarId = organizerEmail ? "primary" : SHARED_CALENDAR_ID;
  const impersonate =
    organizerEmail ?? process.env.GOOGLE_DRIVE_OWNER ?? null;
  if (!calendarId || !impersonate) return;

  const auth = getGoogleClient(impersonate, GOOGLE_SCOPES.calendar);
  if (!auth) return;
  const api = calendarApi({ version: "v3", auth });

  await tryGoogle("calendar.delete", async () => {
    try {
      await api.events.delete({ calendarId, eventId });
    } catch (err) {
      // Already gone is success for our purposes.
      const status = (err as { code?: number })?.code;
      if (status !== 404 && status !== 410) throw err;
    }
    return null;
  });
}

// ---------- Dispatch jobs ----------

/** Create or move the calendar event for a dispatch job. */
export async function syncJobEvent(jobId: string): Promise<void> {
  if (!isGoogleConfigured()) return;

  const job = await prisma.dispatchJob.findUnique({
    where: { id: jobId },
    include: {
      driver: { select: { email: true } },
      subscription: {
        include: {
          company: { select: { name: true } },
          project: { select: { name: true } },
        },
      },
    },
  });
  if (!job) return;

  // Cancelled or completed work shouldn't keep cluttering the calendar.
  if (job.status === "CANCELED") {
    await removeEvent(job.driver?.email ?? null, job.googleEventId);
    if (job.googleEventId) {
      await prisma.dispatchJob.update({
        where: { id: job.id },
        data: { googleEventId: null },
      });
    }
    return;
  }

  const label = job.type.charAt(0) + job.type.slice(1).toLowerCase();
  const customer = job.subscription?.company.name;
  const project = job.subscription?.project?.name;
  const summary = [
    `${label}${customer ? ` — ${customer}` : ""}`,
    project ? `(${project})` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const eventId = await writeEvent(
    {
      organizerEmail: job.driver?.email ?? null,
      summary,
      description: [
        job.notes,
        project ? `Project: ${project}` : null,
        `Open in BIGVIEW Control: ${appUrl("/dispatch")}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      location: job.siteAddress,
      start: job.scheduledFor,
      end: endTime(job.scheduledFor, JOB_MINUTES[job.type] ?? 60),
    },
    job.googleEventId
  );

  if (eventId && eventId !== job.googleEventId) {
    await prisma.dispatchJob.update({
      where: { id: job.id },
      data: { googleEventId: eventId },
    });
  }
}

/** Remove a job's event. Call BEFORE deleting the row (hard delete). */
export async function deleteJobEvent(jobId: string): Promise<void> {
  if (!isGoogleConfigured()) return;
  const job = await prisma.dispatchJob.findUnique({
    where: { id: jobId },
    select: { googleEventId: true, driver: { select: { email: true } } },
  });
  if (!job?.googleEventId) return;
  await removeEvent(job.driver?.email ?? null, job.googleEventId);
}

// ---------- Activities ----------

export async function syncActivityEvent(activityId: string): Promise<void> {
  if (!isGoogleConfigured()) return;

  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    include: {
      assignee: { select: { email: true } },
      company: { select: { name: true } },
      lead: { select: { title: true } },
      project: { select: { name: true } },
      subscription: { include: { company: { select: { name: true } } } },
    },
  });
  if (!activity) return;

  // Completed work drops off the calendar.
  if (activity.done) {
    await removeEvent(activity.assignee?.email ?? null, activity.googleEventId);
    if (activity.googleEventId) {
      await prisma.activity.update({
        where: { id: activity.id },
        data: { googleEventId: null },
      });
    }
    return;
  }

  const context =
    activity.company?.name ??
    activity.lead?.title ??
    activity.project?.name ??
    activity.subscription?.company.name ??
    null;

  const eventId = await writeEvent(
    {
      organizerEmail: activity.assignee?.email ?? null,
      summary: `${activity.title}${context ? ` — ${context}` : ""}`,
      description: [
        activity.notes,
        `Type: ${activity.type.replace("_", " ").toLowerCase()}`,
        `Open in BIGVIEW Control: ${appUrl("/")}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      start: activity.dueDate,
      end: endTime(activity.dueDate, ACTIVITY_MINUTES[activity.type] ?? 30),
    },
    activity.googleEventId
  );

  if (eventId && eventId !== activity.googleEventId) {
    await prisma.activity.update({
      where: { id: activity.id },
      data: { googleEventId: eventId },
    });
  }
}

/** Remove an activity's event. Call BEFORE deleting the row (hard delete). */
export async function deleteActivityEvent(activityId: string): Promise<void> {
  if (!isGoogleConfigured()) return;
  const activity = await prisma.activity.findUnique({
    where: { id: activityId },
    select: { googleEventId: true, assignee: { select: { email: true } } },
  });
  if (!activity?.googleEventId) return;
  await removeEvent(activity.assignee?.email ?? null, activity.googleEventId);
}
