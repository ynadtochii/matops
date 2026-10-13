import type { Metadata } from "next";
import { Suspense } from "react";

import { MatLoader } from "~/app/_components/mat-loader";
import { DeskScreen } from "./desk-screen";

export const metadata: Metadata = {
  title: "Check in",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function DeskPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-screen-2xl flex-col">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center">
            <MatLoader label="Opening check-in" />
          </div>
        }
      >
        <Desk params={params} />
      </Suspense>
    </main>
  );
}

async function Desk({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <DeskScreen token={token} />;
}
