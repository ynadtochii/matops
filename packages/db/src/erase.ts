import { and, eq, inArray, ne, sql } from "drizzle-orm";

import type { DbExec } from "./client";
import type { TenantTx } from "./tenant";
import {
  accessAssignment,
  accessAssignmentChange,
  classInstance,
  classParticipation,
  entityMembership,
  member,
  memberNote,
  memberRank,
  memberReferral,
  memberReferralAudit,
  membershipMonth,
  membershipPurchase,
  notification,
  notificationOutbox,
  person,
  personGuardian,
  rankPromotion,
  user,
} from "./schema";

export type EraseExec = DbExec | TenantTx;

export type EraseReport = Record<string, number>;

export interface EraseMemberInput {
  academyId: string;
  memberId: string;
  userId: string;
  actorId: string;
}

export async function recomputeBookingCounts(
  exec: EraseExec,
  academyId: string,
): Promise<void> {
  await exec
    .update(classInstance)
    .set({ bookingCount: 0 })
    .where(eq(classInstance.academyId, academyId));
  await exec.execute(sql`
    UPDATE "class" c SET booking_count = sub.c FROM (
      SELECT class_id, count(*)::int AS c FROM "class_participation"
      WHERE academy_id = ${academyId}
        AND booking_status = 'booked' AND booking_tier = 'confirmed'
      GROUP BY class_id
    ) sub WHERE c.id = sub.class_id AND c.academy_id = ${academyId}
  `);
}

// No domain table has a foreign key to `member`/`user`, so nothing cascades:
// a table left out of this list survives the erase.
export async function eraseMemberData(
  exec: TenantTx,
  input: EraseMemberInput,
): Promise<EraseReport> {
  const { academyId, memberId, userId, actorId } = input;
  const report: EraseReport = {};
  const del = async (
    label: string,
    run: () => Promise<{ rowCount?: number | null }>,
  ) => {
    report[label] = (await run()).rowCount ?? 0;
  };

  await del("class_participation", () =>
    exec
      .delete(classParticipation)
      .where(
        and(
          eq(classParticipation.academyId, academyId),
          eq(classParticipation.studentId, userId),
        ),
      ),
  );
  await del("member_referral_audit", () =>
    exec
      .delete(memberReferralAudit)
      .where(
        and(
          eq(memberReferralAudit.academyId, academyId),
          eq(memberReferralAudit.studentMemberId, memberId),
        ),
      ),
  );
  await del("member_referral", () =>
    exec
      .delete(memberReferral)
      .where(
        and(
          eq(memberReferral.academyId, academyId),
          eq(memberReferral.studentMemberId, memberId),
        ),
      ),
  );
  await del("rank_promotion", () =>
    exec
      .delete(rankPromotion)
      .where(
        and(
          eq(rankPromotion.academyId, academyId),
          eq(rankPromotion.memberId, memberId),
        ),
      ),
  );
  await del("member_rank", () =>
    exec
      .delete(memberRank)
      .where(
        and(
          eq(memberRank.academyId, academyId),
          eq(memberRank.memberId, memberId),
        ),
      ),
  );
  await del("member_note", () =>
    exec
      .delete(memberNote)
      .where(
        and(
          eq(memberNote.academyId, academyId),
          eq(memberNote.memberId, memberId),
        ),
      ),
  );
  await del("notification", () =>
    exec
      .delete(notification)
      .where(
        and(
          eq(notification.academyId, academyId),
          eq(notification.userId, userId),
        ),
      ),
  );
  await del("notification_outbox", () =>
    exec
      .delete(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.academyId, academyId),
          eq(notificationOutbox.recipientKey, `user:${userId}`),
        ),
      ),
  );

  const orphaned = await exec
    .update(memberReferral)
    .set({ referrerMemberId: null })
    .where(
      and(
        eq(memberReferral.academyId, academyId),
        eq(memberReferral.referrerMemberId, memberId),
      ),
    )
    .returning({ studentMemberId: memberReferral.studentMemberId });
  report.referral_credit_cleared = orphaned.length;
  if (orphaned.length > 0) {
    await exec.insert(memberReferralAudit).values(
      orphaned.map((o) => ({
        academyId,
        studentMemberId: o.studentMemberId,
        oldReferrerMemberId: null,
        newReferrerMemberId: null,
        action: "cleared" as const,
        actorId,
      })),
    );
  }

  // Other students' history still names this person as a referrer. The row is
  // append-only and belongs to the student it is about, so the credit is
  // forgotten rather than the row deleted, exactly as the live referral above.
  const oldCredit = await exec
    .update(memberReferralAudit)
    .set({ oldReferrerMemberId: null })
    .where(
      and(
        eq(memberReferralAudit.academyId, academyId),
        eq(memberReferralAudit.oldReferrerMemberId, memberId),
      ),
    )
    .returning({ id: memberReferralAudit.id });
  const newCredit = await exec
    .update(memberReferralAudit)
    .set({ newReferrerMemberId: null })
    .where(
      and(
        eq(memberReferralAudit.academyId, academyId),
        eq(memberReferralAudit.newReferrerMemberId, memberId),
      ),
    )
    .returning({ id: memberReferralAudit.id });
  report.referral_history_cleared = oldCredit.length + newCredit.length;

  await recomputeBookingCounts(exec, academyId);
  return report;
}

/**
 * Drop the person's access to ONE entity. Their memberships of sibling entities
 * in the same organization are untouched: erasing someone from the Tuesday mat
 * must not remove them from the Thursday one (ADR 124).
 */
export async function deleteEntityMembership(
  exec: DbExec,
  entityId: string,
  userId: string,
): Promise<void> {
  await exec
    .delete(entityMembership)
    .where(
      and(
        eq(entityMembership.entityId, entityId),
        eq(entityMembership.userId, userId),
      ),
    );
}

/**
 * Drop this person's shared memberships across the whole organization.
 *
 * DELIBERATELY not part of {@link eraseMemberData}, which runs at ONE entity.
 * An assignment is held once for the organization and can cover a mat and a
 * gym at the same time, so erasing someone from the mat must leave it standing
 * (ADR 126). It goes only when their last entity membership has gone, beside
 * `deleteMemberRow`, because at that point there is no branch left for it to
 * cover. Runs on the base connection: the row is organization-scoped and an
 * entity transaction is the wrong scope to reach it from.
 */
export async function deleteOrganizationAssignments(
  exec: DbExec,
  organizationId: string,
  userId: string,
): Promise<number> {
  await exec
    .delete(membershipPurchase)
    .where(
      and(
        eq(membershipPurchase.organizationId, organizationId),
        eq(membershipPurchase.userId, userId),
      ),
    );

  // The months hang off the assignment with a foreign key, so they go first or
  // the delete below is refused. `membership_month_audit` deliberately has no
  // such key and is NOT deleted: who marked which month paid outlives the
  // membership it was about.
  await exec.delete(membershipMonth).where(
    and(
      eq(membershipMonth.organizationId, organizationId),
      inArray(
        membershipMonth.assignmentId,
        exec
          .select({ id: accessAssignment.id })
          .from(accessAssignment)
          .where(
            and(
              eq(accessAssignment.organizationId, organizationId),
              eq(accessAssignment.userId, userId),
            ),
          ),
      ),
    ),
  );

  // The scheduled plan changes point at two assignments each, so they go
  // first. The record of a change is only meaningful while the memberships it
  // moved between still exist (ADR 129).
  await exec
    .delete(accessAssignmentChange)
    .where(
      and(
        eq(accessAssignmentChange.organizationId, organizationId),
        eq(accessAssignmentChange.userId, userId),
      ),
    );

  const gone = await exec
    .delete(accessAssignment)
    .where(
      and(
        eq(accessAssignment.organizationId, organizationId),
        eq(accessAssignment.userId, userId),
      ),
    )
    .returning({ id: accessAssignment.id });
  return gone.length;
}

export async function deleteMemberRow(
  exec: DbExec,
  organizationId: string,
  userId: string,
): Promise<void> {
  await exec
    .delete(personGuardian)
    .where(
      and(
        eq(personGuardian.organizationId, organizationId),
        eq(personGuardian.guardianUserId, userId),
      ),
    );
  await exec
    .update(person)
    .set({ accountUserId: null })
    .where(
      and(
        eq(person.organizationId, organizationId),
        eq(person.accountUserId, userId),
      ),
    );
  await exec
    .delete(member)
    .where(
      and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
    );
}

/**
 * Does this person still belong to any entity of this organization?
 *
 * Purging someone from one mat must not take away the organization membership
 * that is their way into the other one, so the Better Auth row is only removed
 * once the last entity membership is gone (ADR 124).
 */
export async function hasSiblingEntityMemberships(
  exec: DbExec,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const rows = await exec
    .select({ id: entityMembership.id })
    .from(entityMembership)
    .where(
      and(
        eq(entityMembership.userId, userId),
        eq(entityMembership.organizationId, organizationId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Does this person belong to any OTHER gym? Decides whether the account goes. */
export async function hasOtherMemberships(
  exec: DbExec,
  userId: string,
  excludingOrganizationId: string,
): Promise<boolean> {
  const rows = await exec
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.userId, userId),
        ne(member.organizationId, excludingOrganizationId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function deleteUserRow(
  exec: DbExec,
  userId: string,
): Promise<void> {
  await exec.delete(user).where(eq(user.id, userId));
}
