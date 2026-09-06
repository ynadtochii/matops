import { Suspense } from "react";
import { redirect } from "next/navigation";

import { entityHref } from "@matops/domain";

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
  const { entities, canCreateBranches } = await myEntities();

  const only = entities.length === 1 ? entities[0] : undefined;
  if (only) redirect(entityHref(only.id));
  if (entities.length > 1) redirect("/overview");
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
