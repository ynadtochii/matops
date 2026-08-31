import { Suspense } from "react";
import { notFound } from "next/navigation";

import { findPublicAcademyByCode } from "@matops/db";
import { db } from "@matops/db/client";
import { Logo } from "@matops/ui/logo";

import { MatLoader } from "~/app/_components/mat-loader";
import { BookingPage } from "./booking-page";

/**
 * The shared booking link (spec O6, ADR 115): `/book/<code>`, using the gym's
 * own 6-digit code. No token, because there is nothing to revoke: the page only
 * shows classes the owner shared, and the master switch in Settings is the off
 * button.
 *
 * This page is a CONSUMER of the public API, not a shortcut past it. It uses the
 * academy's own key, so any gap in the contract shows up here first, before a
 * customer's website hits it.
 */
export default function BookPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  return (
    <main className="container flex min-h-screen flex-col items-center gap-8 py-12">
      <Logo size={26} />
      <Suspense fallback={<MatLoader label="Opening the schedule" />}>
        <Resolve params={params} />
      </Suspense>
    </main>
  );
}

async function Resolve({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const academy = /^\d{6}$/.test(code)
    ? await findPublicAcademyByCode(code, db)
    : null;
  if (!academy) notFound();
  return <BookingPage apiKey={academy.apiKey} />;
}
