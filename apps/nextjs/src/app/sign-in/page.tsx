import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo, Mark } from "@matops/ui/logo";

import { getSession } from "~/auth/server";
import { Eyebrow } from "../_components/primitives";
import { SignIn } from "../_components/sign-in";

const ANCHORS = ["Schedule", "Members", "Attendance", "Dues"];

/**
 * Signed-out entry (spec S1). The one branded moment: a blueprint panel — the
 * bg-grid texture with an oversized basketweave mark bled off the corner — sets
 * the "run the mat" thesis, with the passwordless form on the other side. Splits
 * to a stacked, compact header on small screens. No marketing site (out of scope).
 */
export default async function SignInPage() {
  const session = await getSession();
  if (session) redirect("/");

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
            Run the mat, not the paperwork.
          </h1>
          <p className="text-muted-foreground mt-4 max-w-sm text-[15px] leading-relaxed">
            Schedule classes, keep your member list straight, and take
            attendance in seconds — one console for the whole academy.
          </p>
          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2">
            {ANCHORS.map((a) => (
              <Eyebrow key={a}>{a}</Eyebrow>
            ))}
          </div>
        </div>

        <Eyebrow className="relative">Owner &amp; instructor console</Eyebrow>
      </aside>

      {/* Form side */}
      <div className="flex flex-col items-center justify-center gap-8 p-6">
        <div className="flex flex-col items-center gap-3 text-center lg:hidden">
          <Logo size={32} />
          <p className="text-muted-foreground max-w-sm text-sm">
            Run the mat, not the paperwork.
          </p>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-6 hidden lg:block">
            <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Welcome back. Pick up where your academy left off.
            </p>
          </div>
          <SignIn callbackURL="/" />

          {/* Owners start here. A rare, deliberate action, so it is its own link
              off the sign-in form — not offered to everyone after login (ADR 49). */}
          <p className="text-muted-foreground mt-6 text-center text-sm">
            Running a gym?{" "}
            <Link
              href="/start"
              className="text-brand-strong font-medium underline-offset-4 hover:underline"
            >
              Start a gym
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
