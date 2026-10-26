import type { Metadata } from "next";
import { Suspense } from "react";

import { Logo } from "@matops/ui/logo";

import { MatLoader } from "~/app/_components/mat-loader";
import { DropInForm } from "./drop-in-form";

export const metadata: Metadata = {
  title: "Drop in",
  robots: { index: false, follow: false },
};

export default function DropInPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ class?: string; by?: string }>;
}) {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-8 py-16">
      <Logo size={26} />
      <Suspense fallback={<MatLoader label="Opening the form" />}>
        <DropIn params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function DropIn({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ class?: string; by?: string }>;
}) {
  const [{ token }, { class: classId, by }] = await Promise.all([
    params,
    searchParams,
  ]);
  return (
    <DropInForm token={token} linkedClassId={classId ?? null} sharedBy={by} />
  );
}
