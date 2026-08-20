import { redirect } from "next/navigation";

import { ProfileScreen } from "~/app/_components/profile-screen";
import { getSession } from "~/auth/server";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const phone = session.user.phone;

  return (
    <ProfileScreen
      name={session.user.name}
      email={session.user.email}
      phone={typeof phone === "string" ? phone : ""}
    />
  );
}
