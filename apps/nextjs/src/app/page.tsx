import { getSession } from "~/auth/server";
import { Home } from "./_components/home";
import { SignIn } from "./_components/sign-in";

export default async function HomePage() {
  const session = await getSession();

  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-8 py-16">
      {session ? (
        <div className="w-full">
          <Home />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6">
          <h1 className="text-4xl font-extrabold tracking-tight">matops</h1>
          <p className="text-muted-foreground text-center">
            Run your grappling academy — schedule, roster, and attendance.
          </p>
          <SignIn />
        </div>
      )}
    </main>
  );
}
