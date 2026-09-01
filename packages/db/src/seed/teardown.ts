/**
 * Seed teardown + status. The load-bearing safety property lives here: teardown
 * ONLY ever deletes rows whose `academy_id` is a seed academy, or auth rows whose
 * id starts with `seed_`. It can never touch a real academy or your real user
 * (their id has no `seed_` prefix). See seed/teardown.test.ts for the invariant.
 *
 * Imports only the schema + drizzle operators (never `./client`), so it runs
 * against an injected executor (PGlite in tests) with no connection side effect.
 */
import { count, eq, inArray, like } from "drizzle-orm";

import type { SeedExec } from "./registry";
import {
  academyInvite,
  academyProfile,
  account,
  classInstance,
  classParticipation,
  classTemplate,
  curriculumBlock,
  curriculumBlockTemplate,
  curriculumTrack,
  dropIn,
  dropInVisit,
  entity,
  entityMembership,
  member,
  memberDues,
  memberNote,
  memberRank,
  memberReferral,
  memberReferralAudit,
  membershipPlan,
  organization,
  paymentClaim,
  paymentSettings,
  rankPromotion,
  session,
  user,
} from "../schema";
import { SEED_MARKER, seedAcademyIds, seedAcademyList } from "./registry";

/** Row counts deleted, per table. */
export type TeardownReport = Record<string, number>;

const SEED_ID_LIKE = `${SEED_MARKER}%`;

/**
 * Remove every seed row. Deletes child → parent so the real foreign keys hold
 * (participations before classes, dues/claims before plans, classes before
 * templates, members before their org/user). Idempotent: a second run just
 * deletes nothing.
 */
export async function removeAll(exec: SeedExec): Promise<TeardownReport> {
  const ids = [...seedAcademyIds];
  const report: TeardownReport = {};
  // Count deleted rows without a per-table `.returning()` type dance.
  const del = async (
    label: string,
    run: () => Promise<{ rowCount?: number | null }>,
  ) => {
    const res = await run();
    report[label] = res.rowCount ?? 0;
  };

  // Tenant tables, scoped by academy_id, child → parent (respects the real FKs:
  // participation→class, dues/claim→plan, class→template).
  await del("class_participation", () =>
    exec
      .delete(classParticipation)
      .where(inArray(classParticipation.academyId, ids)),
  );
  await del("member_referral_audit", () =>
    exec
      .delete(memberReferralAudit)
      .where(inArray(memberReferralAudit.academyId, ids)),
  );
  await del("member_referral", () =>
    exec.delete(memberReferral).where(inArray(memberReferral.academyId, ids)),
  );
  await del("drop_in_visit", () =>
    exec.delete(dropInVisit).where(inArray(dropInVisit.academyId, ids)),
  );
  await del("drop_in", () =>
    exec.delete(dropIn).where(inArray(dropIn.academyId, ids)),
  );
  await del("payment_claim", () =>
    exec.delete(paymentClaim).where(inArray(paymentClaim.academyId, ids)),
  );
  await del("member_dues", () =>
    exec.delete(memberDues).where(inArray(memberDues.academyId, ids)),
  );
  await del("rank_promotion", () =>
    exec.delete(rankPromotion).where(inArray(rankPromotion.academyId, ids)),
  );
  await del("member_note", () =>
    exec.delete(memberNote).where(inArray(memberNote.academyId, ids)),
  );
  await del("member_rank", () =>
    exec.delete(memberRank).where(inArray(memberRank.academyId, ids)),
  );
  await del("payment_settings", () =>
    exec.delete(paymentSettings).where(inArray(paymentSettings.academyId, ids)),
  );
  await del("class", () =>
    exec.delete(classInstance).where(inArray(classInstance.academyId, ids)),
  );
  await del("membership_plan", () =>
    exec.delete(membershipPlan).where(inArray(membershipPlan.academyId, ids)),
  );
  await del("class_template", () =>
    exec.delete(classTemplate).where(inArray(classTemplate.academyId, ids)),
  );
  await del("academy_invite", () =>
    exec.delete(academyInvite).where(inArray(academyInvite.academyId, ids)),
  );
  await del("curriculum_block", () =>
    exec.delete(curriculumBlock).where(inArray(curriculumBlock.academyId, ids)),
  );
  await del("curriculum_block_template", () =>
    exec
      .delete(curriculumBlockTemplate)
      .where(inArray(curriculumBlockTemplate.academyId, ids)),
  );
  await del("curriculum_track", () =>
    exec.delete(curriculumTrack).where(inArray(curriculumTrack.academyId, ids)),
  );

  // Entity foundation rows, scoped by the seed org id (ADR 124). Membership and
  // profile before the entity they key on.
  await del("entity_membership", () =>
    exec
      .delete(entityMembership)
      .where(inArray(entityMembership.organizationId, ids)),
  );
  await del("academy_profile", () =>
    exec.delete(academyProfile).where(inArray(academyProfile.entityId, ids)),
  );
  await del("entity", () =>
    exec.delete(entity).where(inArray(entity.organizationId, ids)),
  );

  // Better Auth membership rows, scoped by the seed org id.
  await del("member", () =>
    exec.delete(member).where(inArray(member.organizationId, ids)),
  );

  // Auth rows the seed created, scoped by the `seed_` id prefix — NEVER the real
  // user, whose id carries no prefix.
  await del("session", () =>
    exec.delete(session).where(like(session.userId, SEED_ID_LIKE)),
  );
  await del("account", () =>
    exec.delete(account).where(like(account.userId, SEED_ID_LIKE)),
  );
  await del("user", () => exec.delete(user).where(like(user.id, SEED_ID_LIKE)));

  // Finally the orgs themselves.
  await del("organization", () =>
    exec.delete(organization).where(inArray(organization.id, ids)),
  );

  return report;
}

/** Per-academy presence + a few row counts, for `seed status`. */
export interface SeedAcademyStatus {
  key: string;
  academyId: string;
  name: string;
  present: boolean;
  members: number;
  classes: number;
  dues: number;
}

/** Report which seed academies exist and roughly how much data each holds. */
export async function seedStatus(exec: SeedExec): Promise<SeedAcademyStatus[]> {
  const result: SeedAcademyStatus[] = [];
  for (const a of seedAcademyList) {
    const org = await exec
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, a.id))
      .limit(1);
    const members = await exec
      .select({ n: count() })
      .from(member)
      .where(eq(member.organizationId, a.id));
    const classes = await exec
      .select({ n: count() })
      .from(classInstance)
      .where(eq(classInstance.academyId, a.id));
    const dues = await exec
      .select({ n: count() })
      .from(memberDues)
      .where(eq(memberDues.academyId, a.id));
    result.push({
      key: a.key,
      academyId: a.id,
      name: a.name,
      present: org.length > 0,
      members: members[0]?.n ?? 0,
      classes: classes[0]?.n ?? 0,
      dues: dues[0]?.n ?? 0,
    });
  }
  return result;
}
