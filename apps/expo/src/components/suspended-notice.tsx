import { View } from "react-native";

import { EmptyState, Heading, Mark, Screen } from "./ui";

/**
 * Shown on the student tabs when the signed-in member's tie to the active
 * academy is `suspended`. A suspended member keeps a row (history is kept) but
 * every enrolled query — schedule, dues, stats — is rejected by the server. So
 * rather than let each tab surface a scary "couldn't load" error, the tab
 * screens short-circuit to this calm notice. `academy.current` is a plain
 * protected query (not enrolled), so it still resolves for a suspended member
 * and carries the academy name + status the screens gate on.
 */
export function SuspendedNotice({ name }: { name?: string | null }) {
  return (
    <Screen>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <Heading>{name ?? "Suspended"}</Heading>
        <Mark size={26} />
      </View>
      <EmptyState
        title="Your membership is paused."
        body="An owner has suspended your access. Reach out to your gym to get it restored."
      />
    </Screen>
  );
}
