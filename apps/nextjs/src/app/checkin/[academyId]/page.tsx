import { Suspense } from "react";

import { Logo } from "@matops/ui/logo";

import { MatLoader } from "~/app/_components/mat-loader";
import { DropInForm } from "./drop-in-form";
import { OpenInApp } from "./open-in-app";

/**
 * Public drop-in / check-in page (spec §4, slice 3.5). No login — the gym QR
 * poster points here. A first-time, no-app visitor leaves their contact + consent
 * and is captured as a lead + attendance. Not a public booking page.
 */
export default function DropInPage({
  params,
}: {
  params: Promise<{ academyId: string }>;
}) {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-8 py-16">
      <Logo size={26} />
      <Suspense fallback={<MatLoader label="Opening check-in" />}>
        <DropIn params={params} />
      </Suspense>
    </main>
  );
}

async function DropIn({ params }: { params: Promise<{ academyId: string }> }) {
  const { academyId } = await params;
  return (
    <>
      <DropInForm academyId={academyId} />
      <OpenInApp academyId={academyId} />
    </>
  );
}
