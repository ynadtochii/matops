import type { Metadata } from "next";
import { Suspense } from "react";

import { MatLoader } from "~/app/_components/mat-loader";
import { VisitorPage } from "./visitor-page";

export const metadata: Metadata = {
  title: "Train with us",
  robots: { index: false, follow: false },
};

export default function AcademyPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ by?: string }>;
}) {
  return (
    <main className="h-dvh [scrollbar-gutter:stable] overflow-y-auto overscroll-none">
      <div className="container flex flex-col items-center gap-8 py-12">
        <Suspense fallback={<MatLoader label="Opening the page" />}>
          <Academy params={params} searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Academy({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ by?: string }>;
}) {
  const [{ token }, { by }] = await Promise.all([params, searchParams]);
  return <VisitorPage token={token} sharedBy={by ?? null} />;
}
