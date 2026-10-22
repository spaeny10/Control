// Shared mapping from domain statuses to badge variants.
type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const map: Record<string, BadgeVariant> = {
  // Lead stages
  UNQUALIFIED: "outline",
  CONTACTED: "secondary",
  QUALIFIED: "default",
  QUOTE_SENT: "default",
  WON: "default",
  LOST: "destructive",
  // Project status
  UPCOMING: "secondary",
  ACTIVE: "default",
  COMPLETED: "outline",
  // Trailer status
  AVAILABLE: "default",
  ASSIGNED: "outline",
  DEPLOYED: "secondary",
  INSPECTION: "outline",
  MAINTENANCE: "destructive",
  RETIRED: "outline",
  // Quote status
  DRAFT: "secondary",
  SENT: "default",
  ACCEPTED: "default",
  DECLINED: "destructive",
  EXPIRED: "outline",
  // Subscription status
  PENDING: "secondary",
  PAST_DUE: "destructive",
  PAUSED: "outline",
  ENDED: "outline",
  // Invoice status
  OPEN: "default",
  PAID: "default",
  VOID: "outline",
  UNCOLLECTIBLE: "destructive",
};

// The physical state in words a yard hand uses.
export const TRAILER_STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "Available",
  ASSIGNED: "Assigned",
  DEPLOYED: "On site",
  INSPECTION: "Inspection",
  MAINTENANCE: "Maintenance",
  RETIRED: "Retired",
};

export function statusBadgeVariant(status: string): BadgeVariant {
  return map[status] ?? "secondary";
}
