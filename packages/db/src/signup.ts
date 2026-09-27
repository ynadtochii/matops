import { eq, sql } from "drizzle-orm";

import type { TenantTx } from "./tenant";
import { entityMembership } from "./entity-schema";
import { memberNote, memberRank } from "./rank-notes-schema";
import { waiverAcceptance } from "./waiver-schema";

export async function saveSignupAnswers(
  tx: TenantTx,
  input: {
    academyId: string;
    memberId: string;
    userId: string;
    rank: { discipline: string; belt: string; stripes: number } | null;
    notes: string[];
    emailUpdates: boolean;
    waiverId: string | null;
  },
): Promise<void> {
  if (input.rank) {
    // A rank staff already set wins over what the student says on a re-join.
    await tx
      .insert(memberRank)
      .values({
        academyId: input.academyId,
        memberId: input.memberId,
        ...input.rank,
        updatedBy: input.userId,
      })
      .onConflictDoNothing();
  }
  if (input.notes.length > 0) {
    await tx.insert(memberNote).values(
      input.notes.map((body) => ({
        academyId: input.academyId,
        memberId: input.memberId,
        body,
        authorId: input.userId,
      })),
    );
  }
  if (input.waiverId) {
    await tx
      .insert(waiverAcceptance)
      .values({
        academyId: input.academyId,
        memberId: input.memberId,
        waiverId: input.waiverId,
      })
      .onConflictDoNothing();
  }
  await tx
    .update(entityMembership)
    .set({ emailUpdatesAt: input.emailUpdates ? sql`now()` : null })
    .where(eq(entityMembership.id, input.memberId));
}
