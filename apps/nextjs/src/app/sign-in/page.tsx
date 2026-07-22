import { redirect } from "next/navigation";

import { Logo } from "@matops/ui/logo";

import { getSession } from "~/auth/server";
import { SignIn } from "../_components/sign-in";

/** Signed-out entry (spec S1). Branded, minimal — no marketing site (out of scope). */
export default async function SignInPage() {
  const session = await getSession();
  if (session) redirect("/");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo size={36} />
        <p className="text-muted-foreground max-w-sm text-sm">
          Schedule, roster, and attendance for your grappling academy.
        </p>
      </div>
      <SignIn callbackURL="/" />
    </main>
  );
}
