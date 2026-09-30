import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { AuthDoor } from "~/app/_components/auth-door";
import { CreateGym } from "~/app/_components/create-gym";
import { MatLoader } from "~/app/_components/mat-loader";
import { SignIn } from "~/app/_components/sign-in";
import { getSession } from "~/auth/server";
import { getQueryClient, trpc } from "~/trpc/server";

export const metadata: Metadata = {
  alternates: { canonical: "/start" },
  title: "Start your academy",
  description:
    "Name your academy and start running it: classes, students, bookings and attendance.",
};

/**
 * "Start a gym" (spec FP1, ADR 49). The deliberate gym-creation entry, reached
 * from the sign-in page. Creating a gym is a rare action, so it is NOT the
 * default post-login screen. It needs a signed-in user: a signed-out visitor
 * gets sign-in here (returning to `/start` after auth). Someone who already
 * runs a gym with an academy is sent to it, so a second visit cannot make a
 * second gym; an owner whose gym has no academy yet finishes it here.
 */
export default function StartPage() {
  return (
    <AuthDoor
      headline={
        <>
          Open your gym
          <br />
          in a minute.
        </>
      }
      blurb="Name your academy and you own it right away. Add your classes, invite your students, then start taking bookings."
    >
      <Suspense fallback={<MatLoader label="Opening your gym" />}>
        <StartForm />
      </Suspense>
    </AuthDoor>
  );
}

async function StartForm() {
  const session = await getSession();
  if (session) {
    const owned = await getQueryClient().fetchQuery(
      trpc.organization.mine.queryOptions(),
    );
    if (owned.length === 0) return <CreateGym />;
    if (!session.session.activeOrganizationId) redirect("/");
    const gym = await getQueryClient().fetchQuery(
      trpc.entity.list.queryOptions(),
    );
    if (gym.entities.length > 0 || !gym.canCreateBranches) redirect("/");
    return <CreateGym organizationName={gym.organizationName} />;
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Start your academy
        </h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Sign in first, then name your academy.
        </p>
      </div>
      <SignIn callbackURL="/start" />
    </div>
  );
}
