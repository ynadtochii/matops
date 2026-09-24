import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthSplit } from "~/app/_components/auth-split";
import { CreateGym } from "~/app/_components/create-gym";
import { MatLoader } from "~/app/_components/mat-loader";
import { SignIn } from "~/app/_components/sign-in";
import { getSession } from "~/auth/server";

export const metadata: Metadata = {
  title: "Start a gym",
  description:
    "Name your gym and start running it: classes, members, attendance and dues.",
};

/**
 * "Start a gym" (spec FP1, ADR 49). The deliberate gym-creation entry, reached
 * from the sign-in page. Creating a gym is a rare action, so it is NOT the
 * default post-login screen. It needs a signed-in user: a signed-out visitor
 * gets sign-in here (returning to `/start` after auth), and creating drops the
 * new owner on `/overview`, where they add the first branch (ADR 128).
 */
export default function StartPage() {
  return (
    <AuthSplit
      headline={
        <>
          Open your gym
          <br />
          in a minute.
        </>
      }
      blurb="Name your gym and you own it right away. Add your first branch, invite your instructors and students, then start taking attendance."
    >
      <Suspense fallback={<MatLoader label="Opening your gym" />}>
        <StartForm />
      </Suspense>
    </AuthSplit>
  );
}

async function StartForm() {
  const session = await getSession();
  if (session) return <CreateGym />;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Start a gym</h1>
        <p className="text-muted-foreground text-sm text-pretty">
          Sign in first, then name your gym.
        </p>
      </div>
      <SignIn callbackURL="/start" />
    </div>
  );
}
