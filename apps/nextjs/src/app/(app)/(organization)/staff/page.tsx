import { redirect } from "next/navigation";

/**
 * Staff is a tab inside People now (ADR 129). The URL stays alive because it is
 * bookmarked and linked from older messages; the screen behind it is gone.
 */
export default function StaffPage() {
  redirect("/people?tab=staff");
}
