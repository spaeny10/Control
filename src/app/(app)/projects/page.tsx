import { redirect } from "next/navigation";

/* Retired — see projects/[id]/page.tsx. The project-track leads board is the
   direct equivalent: every job we're chasing, with the ones we're already on
   living under Subscriptions. */
export default function ProjectsIndexRedirect() {
  redirect("/leads?track=NEW_PROJECT");
}
