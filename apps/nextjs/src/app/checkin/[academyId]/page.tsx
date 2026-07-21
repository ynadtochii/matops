import { DropInForm } from "./drop-in-form";

/**
 * Public drop-in / check-in page (spec §4, slice 3.5). No login — the gym QR
 * poster points here. A first-time, no-app visitor leaves their contact + consent
 * and is captured as a lead + attendance. Not a public booking page.
 */
export default async function DropInPage({
  params,
}: {
  params: Promise<{ academyId: string }>;
}) {
  const { academyId } = await params;
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center py-16">
      <DropInForm academyId={academyId} />
    </main>
  );
}
