import type { LeadStage, LeadType } from "@prisma/client";

/* The two lead tracks have different economics, so they get different stages
   and different reporting. See prisma/schema.prisma on model Lead.

   - NEW_COMPANY (organization): prospecting onto a contractor's vendor list.
     No MRR, no quote. Won means "approved vendor".
   - NEW_PROJECT (project): a specific job. The only track that produces
     deployable revenue, so it alone feeds pipeline MRR. */

/** Stages that belong in a forecast: qualified work, not yet closed.
    UNQUALIFIED is excluded on purpose — that boundary is the point of the
    two-track model. Every pipeline aggregate should use this. */
export const OPEN_PIPELINE_STAGES: LeadStage[] = [
  "CONTACTED",
  "QUALIFIED",
  "QUOTE_SENT",
];

/** You quote a job, not a company, so the organization board has no
    QUOTE_SENT column. */
const ORGANIZATION_STAGES: LeadStage[] = [
  "UNQUALIFIED",
  "CONTACTED",
  "QUALIFIED",
  "WON",
  "LOST",
];

const PROJECT_STAGES: LeadStage[] = [
  "UNQUALIFIED",
  "CONTACTED",
  "QUALIFIED",
  "QUOTE_SENT",
  "WON",
  "LOST",
];

export function stagesForTrack(type: LeadType): LeadStage[] {
  return type === "NEW_COMPANY" ? ORGANIZATION_STAGES : PROJECT_STAGES;
}

const BASE_LABELS: Record<LeadStage, string> = {
  UNQUALIFIED: "Unqualified",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  QUOTE_SENT: "Quote sent",
  WON: "Won",
  LOST: "Lost",
};

// The enum is shared across tracks, so closure reads differently per track.
const ORGANIZATION_LABELS: Partial<Record<LeadStage, string>> = {
  WON: "Vendor approved",
  LOST: "Not a fit",
};

export function stageLabel(type: LeadType, stage: LeadStage): string {
  if (type === "NEW_COMPANY") {
    return ORGANIZATION_LABELS[stage] ?? BASE_LABELS[stage];
  }
  return BASE_LABELS[stage];
}

/** Only the project track carries money. */
export function isRevenueTrack(type: LeadType): boolean {
  return type === "NEW_PROJECT";
}

export const TRACK_LABELS: Record<LeadType, string> = {
  NEW_PROJECT: "Projects",
  NEW_COMPANY: "Organizations",
};

/** Resolve the `?track=` search param. Projects is the default because it's
    the revenue view most people want first. */
export function trackFromParam(value: string | undefined): LeadType {
  return value === "NEW_COMPANY" || value === "org" ? "NEW_COMPANY" : "NEW_PROJECT";
}
