import { and, eq, ne, sql } from "drizzle-orm";

import type { DbExec } from "./client";
import type { TenantTx } from "./tenant";
import {
  classInstance,
  classParticipation,
  member,
  memberDues,
  memberNote,
  memberRank,
  memberReferral,
  memberReferralAudit,
  notification,
  paymentClaim,
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
  await del("payment_claim", () =>
    exec
      .delete(paymentClaim)
      .where(
        and(
          eq(paymentClaim.academyId, academyId),
          eq(paymentClaim.memberId, memberId),
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
  await del("member_dues", () =>
    exec
      .delete(memberDues)
      .where(
        and(
          eq(memberDues.academyId, academyId),
          eq(memberDues.memberId, memberId),
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

  await recomputeBookingCounts(exec, academyId);
  return report;
}

export async function deleteMemberRow(
  exec: DbExec,
  academyId: string,
  memberId: string,
): Promise<void> {
  await exec
    .delete(member)
    .where(and(eq(member.id, memberId), eq(member.organizationId, academyId)));
}

export async function hasOtherMemberships(
  exec: DbExec,
  userId: string,
  excludingAcademyId: string,
): Promise<boolean> {
  const rows = await exec
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.userId, userId),
        ne(member.organizationId, excludingAcademyId),
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
