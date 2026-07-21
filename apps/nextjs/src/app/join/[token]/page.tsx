import { SignIn } from "~/app/_components/sign-in";
import { getSession } from "~/auth/server";
import { JoinFlow } from "./join-flow";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await getSession();

  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 py-16">
      <JoinFlow token={token} signedIn={!!session} />
      {!session && <SignIn callbackURL={`/join/${token}`} />}
    </main>
  );
}
