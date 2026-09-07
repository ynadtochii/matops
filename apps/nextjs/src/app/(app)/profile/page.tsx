import { Suspense } from "react";
import { redirect } from "next/navigation";

import { entityHref } from "@matops/domain";

import { PageLoader } from "~/app/_components/mat-loader";
import { myEntities } from "~/trpc/server";

// A profile shows rank, join date and the mat's address, so the screen lives
// under the entity. This path exists only to forward an older link.
export default function ProfileRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  return (
    <Suspense fallback={<PageLoader label="Opening your profile" />}>
      <ProfileRedirect searchParams={searchParams} />
    </Suspense>
  );
}

async function ProfileRedirect({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { entities } = await myEntities();
  const { branch } = await searchParams;
  const selected =
    entities.find((entity) => entity.id === branch) ?? entities[0];
  return redirect(selected ? entityHref(selected.id, "/profile") : "/");
}
