import { PageHeader } from "./page-header";
import { Roster } from "./roster";

/**
 * Roster screen (IA ticket 02, spec O4) — the people who train here: pending
 * approvals, active members, and drop-in leads. Join mechanics (the academy code
 * + invite links) live in Settings. This screen grows per-member profiles later.
 */
export function RosterScreen() {
  return (
    <>
      <PageHeader
        title="Roster"
        subtitle="Approve new members and manage who trains at your academy."
      />
      <Roster />
    </>
  );
}
