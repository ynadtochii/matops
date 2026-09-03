import { Suspense } from "react";
import { redirect } from "next/navigation";

import { entityHref } from "@matops/domain";

import { PageLoader } from "~/app/_components/mat-loader";
import { myEntities } from "~/trpc/server";

// A profile shows rank, join date and the mat's address, so the screen lives
// under the entity. This path exists only to forward an older link.
export default function ProfileRedirectPage() {
  return (
    <Suspense fallback={<PageLoader label="Opening your profile" />}>
      <ProfileRedirect />
    </Suspense>
  );
}

async function ProfileRedirect() {
  const { entities } = await myEntities();
  const first = entities[0];
  return redirect(first ? entityHref(first.id, "/profile") : "/");
}
