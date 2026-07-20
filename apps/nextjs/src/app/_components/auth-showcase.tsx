import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Button } from "@matops/ui/button";

import { auth, getSession } from "~/auth/server";

export async function AuthShowcase() {
  const session = await getSession();

  if (!session) {
    return (
      <form className="flex flex-col items-center gap-2">
        <input
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="border-input bg-background rounded-md border px-3 py-2"
        />
        <Button
          size="lg"
          formAction={async (formData) => {
            "use server";
            const value = formData.get("email");
            const email = typeof value === "string" ? value : "";
            await auth.api.signInMagicLink({
              body: { email, callbackURL: "/" },
              headers: await headers(),
            });
          }}
        >
          Send magic link
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <p className="text-center text-2xl">
        <span>Logged in as {session.user.name}</span>
      </p>

      <form>
        <Button
          size="lg"
          formAction={async () => {
            "use server";
            await auth.api.signOut({
              headers: await headers(),
            });
            redirect("/");
          }}
        >
          Sign out
        </Button>
      </form>
    </div>
  );
}
