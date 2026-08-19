import { z } from "zod/v4";

import { Logo } from "@matops/ui/logo";
import { NameSchema, PhoneSchema } from "@matops/validators";

import type { JoinProfile } from "./join-flow";
import { getSession } from "~/auth/server";
import { JoinFlow } from "./join-flow";

const CarriedProfileSchema = z.object({
  firstName: NameSchema,
  lastName: NameSchema,
  phone: PhoneSchema,
});

type Query = Record<string, string | string[] | undefined>;

/**
 * The `p` param is just a URL someone can hand-craft, so the carried profile
 * only prefills the join form (a crafted link must not join or rewrite a
 * profile on its own) and is parsed with the schemas the mutation enforces.
 */
function carriedProfile(query: Query): JoinProfile | undefined {
  const encoded = query.p;
  if (typeof encoded !== "string" || !encoded || encoded.length > 1024) {
    return undefined;
  }
  try {
    const raw: unknown = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    );
    const parsed = CarriedProfileSchema.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Query>;
}) {
  const { token } = await params;
  const session = await getSession();
  const profile = session ? carriedProfile(await searchParams) : undefined;

  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 py-16">
      <Logo size={26} />
      <JoinFlow token={token} signedIn={!!session} profile={profile} />
    </main>
  );
}
