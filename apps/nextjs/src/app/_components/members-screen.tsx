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
        subtitle={`Everyone who trains at this ${words.branch}.`}
      />
      {/* The invite link is a setup step, so it sits under the day's work
          rather than above it. */}
      <div className="flex flex-col gap-10">
        <Members />
        <Invites />
      </div>
    </>
  );
}
