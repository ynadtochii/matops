import { Suspense } from "react";

import { Logo, Mark } from "@matops/ui/logo";

import { CreateAcademy } from "~/app/_components/create-academy";
import { MatLoader } from "~/app/_components/mat-loader";
import { SignIn } from "~/app/_components/sign-in";
import { getSession } from "~/auth/server";
import { Eyebrow } from "../_components/primitives";

/**
 * "Start a gym" (spec 1.1, ADR 49). The deliberate create-academy entry, reached
 * from the landing page — creating a gym is a rare action, so it is NOT the
 * default post-login screen. Creating needs a signed-in user: if the visitor is
 * signed out we show sign-in here (returning to `/start` after auth); once signed
 * in they get the create form, and creating drops them straight into the console.
 */
export default function StartPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Blueprint brand panel — desktop only; the form side carries mobile. */}
      <aside className="bg-brand-wash relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div className="bg-grid absolute inset-0 opacity-40" aria-hidden />
        <Mark
          size={560}
          className="pointer-events-none absolute -right-44 -bottom-44 opacity-[0.08]"
        />

        <Logo size={26} className="relative" />

        <div className="relative max-w-md">
          <h1 className="text-4xl font-semibold tracking-tight text-balance">
            Open your academy in a minute.
          </h1>
          <p className="text-muted-foreground mt-4 max-w-sm text-[15px] leading-relaxed">
            Name your gym and you&apos;re its owner right away — then invite
            your instructors and students and start taking attendance.
          </p>
        </div>

        <Eyebrow className="relative">Owner &amp; instructor console</Eyebrow>
      </aside>

      {/* Form side */}
      <div className="flex flex-col items-center justify-center gap-8 p-6">
        <div className="flex flex-col items-center gap-3 text-center lg:hidden">
          <Logo size={32} />
        </div>

        <div className="flex w-full max-w-sm flex-col gap-6">
          <Suspense fallback={<MatLoader label="Opening your academy" />}>
            <StartForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

async function StartForm() {
  const session = await getSession();
  if (session) return <CreateAcademy />;
  return (
    <>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Start a gym</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Sign in first — then name your academy.
        </p>
      </div>
      <SignIn callbackURL="/start" />
    </>
  );
}
