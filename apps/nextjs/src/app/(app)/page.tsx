import { Suspense } from "react";
import { redirect } from "next/navigation";

import { entityHref } from "@matops/domain";

import { JoinByCode } from "~/app/_components/join-by-code";
import { PageLoader } from "~/app/_components/mat-loader";
import { myEntities } from "~/trpc/server";

export default function LandingPage() {
  return (
    <Suspense fallback={<PageLoader label="Finding your academy" />}>
      <Landing />
    </Suspense>
  );
}

async function Landing() {
  const { entities } = await myEntities();

  const only = entities.length === 1 ? entities[0] : undefined;
  if (only) redirect(entityHref(only.id));
  if (entities.length > 1) redirect("/overview");

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <JoinByCode />
    </div>
  );
}
