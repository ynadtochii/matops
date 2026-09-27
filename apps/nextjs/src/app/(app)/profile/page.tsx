import { Suspense } from "react";
import { redirect } from "next/navigation";

import { entityHref } from "@matops/domain";

import { PageLoader } from "~/app/_components/mat-loader";
import { myEntities } from "~/trpc/server";

export default function ProfileRedirectPage() {
  return (
    <Suspense fallback={<PageLoader label="Opening your profile" />}>
      <ProfileRedirect />
    </Suspense>
  );
}

async function ProfileRedirect() {
  const { entities } = await myEntities();
  return redirect(entities[0] ? entityHref(entities[0].id, "/profile") : "/");
}
