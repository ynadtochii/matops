import { Suspense } from "react";
import { redirect } from "next/navigation";

import type { EntityPageProps } from "~/trpc/server";
import { ProfileScreen } from "~/app/_components/profile-screen";
import { ProfileSkeleton } from "~/app/_components/skeletons";
import { getSession } from "~/auth/server";
import { HydrateClient, prefetch, setRequestEntity, trpc } from "~/trpc/server";

async function ProfileData() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  prefetch(trpc.rank.mine.queryOptions());

  const phone = session.user.phone;

  return (
    <HydrateClient>
      <ProfileScreen
        name={session.user.name}
        email={session.user.email}
        phone={typeof phone === "string" ? phone : ""}
      />
    </HydrateClient>
  );
}

export default async function ProfilePage({ params }: EntityPageProps) {
  setRequestEntity((await params).entityId);

  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileData />
    </Suspense>
  );
}
