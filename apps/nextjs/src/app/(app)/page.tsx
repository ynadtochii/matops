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

  const first = entities[0];
  if (first) redirect(entityHref(first.id));
  // An owner with no academy yet is starting a gym, not looking for one to
  // join (ADR 128). `/start` finishes it.
  if (canCreateBranches) redirect("/start");

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <JoinByCode />
    </div>
  );
}
