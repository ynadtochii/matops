import { Invites } from "./invites";
import { Members } from "./members";
import { PageHeader } from "./page-header";

/**
 * Members screen (IA ticket 02, spec O4) — the people who train here: the
 * student invite link, then three tabs — Requests (pending approvals), Members
 * (active roster) and Drop-in leads (with the check-in poster that feeds them).
 * Staff and the instructor link live on the Coaches screen.
 */
export function MembersScreen() {
  return (
    <>
      <PageHeader
        title="Members"
        subtitle="Invite students, approve them, and manage who trains at your academy."
      />
      <div className="flex flex-col gap-8">
        <Invites />
        <Members />
      </div>
    </>
  );
}
