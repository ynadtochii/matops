"use client";

import { branchWords } from "@matops/domain";

import { useEntity } from "./entity";
import { Invites } from "./invites";
import { Members } from "./members";
import { PageHeader } from "./page-header";

/**
 * Roster (IA ticket 02, spec O4, named by FP9): the people who train here. The
 * student invite link, then three tabs. Requests holds the pending approvals,
 * Members the active list, and Drop-in leads the visitors the check-in poster
 * brings in. Staff and the instructor link live on the Coaches screen.
 */
export function MembersScreen() {
  const words = branchWords(useEntity().type);
  return (
    <>
      <PageHeader
        title="Roster"
        subtitle={`Invite students, approve them, and manage who trains at this ${words.branch}.`}
      />
      <div className="flex flex-col gap-8">
        <Invites />
        <Members />
      </div>
    </>
  );
}
