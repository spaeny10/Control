import { redirect } from "next/navigation";

// Companies merged into the Contacts page (companies view).
export default function CompaniesPage() {
  redirect("/contacts?view=companies");
}
