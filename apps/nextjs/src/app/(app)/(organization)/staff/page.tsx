import { redirect } from "next/navigation";

import { organizationHref } from "@matops/domain";

/**
 * Staff is a tab inside People now (ADR 129). The URL stays alive because it is
 * bookmarked and linked from older messages; the screen behind it is gone.
 */
export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { branch } = await searchParams;
  redirect(organizationHref("/people?tab=staff", branch));
}
