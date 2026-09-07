import { Suspense } from "react";
import { redirect } from "next/navigation";

import { entityHref, organizationHref } from "@matops/domain";

import { JoinByCode } from "~/app/_components/join-by-code";
import { PageLoader } from "~/app/_components/mat-loader";
import { myEntities } from "~/trpc/server";

export default function LandingPage() {
  return (
    <Suspense fallback={<PageLoader label="Finding your gym" />}>
      <Landing />
    </Suspense>
  );
}

async function Landing() {
  const { entities, canCreateBranches, canRunOrganization } =
    await myEntities();

  const first = entities[0];
  const only = entities.length === 1 ? first : undefined;
  if (canRunOrganization) {
    redirect(organizationHref("/overview", entities[0]?.id));
  }
  if (only) redirect(entityHref(only.id));
  if (entities.length > 1 && first) redirect(entityHref(first.id));
  // An owner with no branch yet is starting a gym, not looking for one to join
  // (ADR 128). `canCreateBranches` is already "an active owner of the active
  // organization", so a signed-in person with no gym at all still lands here.
  if (canCreateBranches) redirect("/overview");

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <JoinByCode />
    </div>
  );
}
