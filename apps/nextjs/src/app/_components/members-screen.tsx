import { Members } from "./members";
import { PageHeader } from "./page-header";

/**
 * Members screen (IA ticket 02, spec O4) — the people who train here, split
 * into three tabs: Members (active roster), Requests (pending approvals), and
 * Drop-in leads. Join mechanics (the academy code + invite links) live in
 * Settings.
 */
export function MembersScreen() {
  return (
    <>
      <PageHeader
        title="Members"
        subtitle="Approve new members and manage who trains at your academy."
      />
      <Members />
    </>
  );
}
