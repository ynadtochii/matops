import { Suspense } from "react";

import { Logo } from "@matops/ui/logo";

import { MatLoader } from "~/app/_components/mat-loader";
import { DropInForm } from "./drop-in-form";

export default function DropInPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-8 py-16">
      <Logo size={26} />
      <Suspense fallback={<MatLoader label="Opening the form" />}>
        <DropIn params={params} />
      </Suspense>
    </main>
  );
}

async function DropIn({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <DropInForm token={token} />;
}
