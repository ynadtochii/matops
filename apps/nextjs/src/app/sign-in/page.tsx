import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { Callout } from "@matops/ui/callout";
import { FOCUS_RING } from "@matops/ui/motion";

import { getSession } from "~/auth/server";
import { AuthDoor } from "../_components/auth-door";
import { REQUEST_DEMO_HREF } from "../_components/contact";
import { FinishSignOut } from "../_components/finish-sign-out";
import { PageLoader } from "../_components/mat-loader";
import { SignIn } from "../_components/sign-in";

export const metadata: Metadata = {
  alternates: { canonical: "/sign-in" },
  title: "Sign in",
  description:
    "Sign in to MatOps, the management software for BJJ gyms: schedule, students, bookings and attendance.",
};

/**
 * Signed-out entry (spec S1). One screen, no scroll: the door, not a marketing
 * site. Everyone who signs in on the web arrives here (owners, instructors and
 * students alike), so the form column stays role-neutral.
 */
export default function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ access?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<PageLoader label="Checking your session" />}>
      <SignInGate searchParams={searchParams} />
    </Suspense>
  );
}

async function SignInGate({
  searchParams,
}: {
  searchParams: Promise<{ access?: string | string[] }>;
}) {
  const accessEnded = (await searchParams).access === "ended";
  const session = await getSession();
  if (session && !accessEnded) redirect("/");

  return (
    <AuthDoor
      headline={
        <>
          Run the mat,
          <br />
          not the paperwork.
        </>
      }
      blurb="MatOps runs the admin side of a BJJ academy. Your week of classes, who turned up, and every belt you gave out."
    >
      {accessEnded && (
        <>
          {session && <FinishSignOut />}
          <Callout tone="info" title="You were signed out">
            Your access to that gym has ended. If this is a mistake, ask your
            gym. You can still sign in to another gym.
          </Callout>
        </>
      )}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Use the email your gym has for you. No password to remember.
        </p>
      </div>

      <SignIn callbackURL="/" />

      {/* Gym creation is invite-only (ADR 149): an owner requests a demo, and
          the invited owner gets the /start link directly. */}
      <p className="text-muted-foreground text-sm">
        Running a gym?{" "}
        <a
          href={REQUEST_DEMO_HREF}
          className={`text-foreground decoration-muted-foreground inline-flex min-h-11 items-center rounded-sm font-medium underline underline-offset-4 hover:decoration-current sm:min-h-0 ${FOCUS_RING}`}
        >
          Request a demo
        </a>
      </p>
    </AuthDoor>
  );
}
