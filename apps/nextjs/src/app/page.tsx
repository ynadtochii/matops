import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { entityHref } from "@matops/domain";

import { JoinByCode } from "~/app/_components/join-by-code";
import { Landing } from "~/app/_components/landing";
import { PageLoader } from "~/app/_components/mat-loader";
import AppLayout from "~/app/(app)/layout";
import { getSession } from "~/auth/server";
import { CONSENT_COOKIE, parseConsent } from "~/lib/consent";
import { SITE_DESCRIPTION } from "~/lib/site";
import { myEntities } from "~/trpc/server";

const TITLE = "MatOps: BJJ gym management software";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "MatOps",
    title: TITLE,
    description: SITE_DESCRIPTION,
  },
};

// Outside `(app)`, whose layout sends a signed-out visitor to /sign-in. Signed
// out, `/` is the landing page; signed in, it opens the first academy.
export default function HomePage() {
  return (
    <Suspense fallback={<PageLoader label="Finding your gym" />}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const session = await getSession();
  if (!session) {
    const jar = await cookies();
    return <Landing consent={parseConsent(jar.get(CONSENT_COOKIE)?.value)} />;
  }
  return (
    <AppLayout>
      <OpenFirstAcademy />
    </AppLayout>
  );
}

async function OpenFirstAcademy() {
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
