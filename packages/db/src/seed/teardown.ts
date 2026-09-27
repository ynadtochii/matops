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
  accessAssignment,
  accessAssignmentChange,
  accessPlan,
  accessPlanEntity,
  accessPlanPrice,
  account,
  attendanceCorrection,
  classInstance,
  classParticipation,
  classTemplate,
  dropIn,
  dropInVisit,
  entity,
  entityMembership,
  member,
  memberNote,
  memberRank,
  membershipMonth,
  membershipMonthAudit,
  membershipPolicy,
  notification,
  notificationNotice,
  organization,
  person,
  productEvent,
  rankPromotion,
  session,
  user,
} from "../schema";
import { SEED_MARKER, seedAcademyIds, seedAcademyList } from "./registry";

/** Row counts deleted, per table. */
type TeardownReport = Record<string, number>;

const SEED_ID_LIKE = `${SEED_MARKER}%`;

/**
 * Remove every seed row. Deletes child → parent so the real foreign keys hold
 * (participations before classes, dues/claims before plans, classes before
 * templates, members before their org/user). Idempotent: a second run just
 * deletes nothing.
 */
export async function removeAll(exec: SeedExec): Promise<TeardownReport> {
  const orgIds = [...seedAcademyIds];
  // Tenant rows key on an ENTITY id, and only the DEFAULT entity's equals the
  // organization's (ADR 124). A gym that grew a second mat has rows under an id
  // that is not in the registry, so read the entities rather than assume.
  const entityIds = await exec
    .select({ id: entity.id })
    .from(entity)
    .where(inArray(entity.organizationId, orgIds));
  const ids = [...new Set([...orgIds, ...entityIds.map((e) => e.id)])];
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
  await del("attendance_correction", () =>
    exec
      .delete(attendanceCorrection)
      .where(inArray(attendanceCorrection.academyId, ids)),
  );
  await del("drop_in_visit", () =>
    exec.delete(dropInVisit).where(inArray(dropInVisit.academyId, ids)),
  );
  await del("drop_in", () =>
    exec.delete(dropIn).where(inArray(dropIn.academyId, ids)),
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
  await del("class", () =>
    exec.delete(classInstance).where(inArray(classInstance.academyId, ids)),
  );
  await del("class_template", () =>
    exec.delete(classTemplate).where(inArray(classTemplate.academyId, ids)),
  );
  await del("academy_invite", () =>
    exec.delete(academyInvite).where(inArray(academyInvite.academyId, ids)),
  );

  // What the demo gym wrote while it was being USED: the notification centre
  // and the product event log. Neither is ever seeded, and both hold a foreign
  // key to the entity or the organization, so `seed down` on a gym somebody
  // actually clicked around in fails without them.
  await del("notification", () =>
    exec.delete(notification).where(inArray(notification.academyId, ids)),
  );
  await del("notification_notice", () =>
    exec
      .delete(notificationNotice)
      .where(inArray(notificationNotice.academyId, ids)),
  );
  await del("product_event", () =>
    exec
      .delete(productEvent)
      .where(inArray(productEvent.organizationId, orgIds)),
  );

  // Shared memberships, scoped by the seed org id (ADR 126). Children first:
  // the months and the audit hang off an assignment, and `access_plan_entity`
  // holds a composite key to `entity`, so all of it goes before the entity does.
  await del("membership_month_audit", () =>
    exec
      .delete(membershipMonthAudit)
      .where(inArray(membershipMonthAudit.organizationId, orgIds)),
  );
  await del("membership_month", () =>
    exec
      .delete(membershipMonth)
      .where(inArray(membershipMonth.organizationId, orgIds)),
  );
  await del("access_assignment_change", () =>
    exec
      .delete(accessAssignmentChange)
      .where(inArray(accessAssignmentChange.organizationId, orgIds)),
  );
  await del("access_assignment", () =>
    exec
      .delete(accessAssignment)
      .where(inArray(accessAssignment.organizationId, orgIds)),
  );
  await del("access_plan_entity", () =>
    exec
      .delete(accessPlanEntity)
      .where(inArray(accessPlanEntity.organizationId, orgIds)),
  );
  await del("membership_policy", () =>
    exec
      .delete(membershipPolicy)
      .where(inArray(membershipPolicy.organizationId, orgIds)),
  );
  await del("access_plan_price", () =>
    exec
      .delete(accessPlanPrice)
      .where(inArray(accessPlanPrice.organizationId, orgIds)),
  );
  await del("access_plan", () =>
    exec.delete(accessPlan).where(inArray(accessPlan.organizationId, orgIds)),
  );

  // Entity foundation rows, scoped by the seed org id (ADR 124). Membership and
  // profile before the entity they key on.
  await del("entity_membership", () =>
    exec
      .delete(entityMembership)
      .where(inArray(entityMembership.organizationId, orgIds)),
  );
  await del("academy_profile", () =>
    exec.delete(academyProfile).where(inArray(academyProfile.entityId, ids)),
  );
  await del("entity", () =>
    exec.delete(entity).where(inArray(entity.organizationId, orgIds)),
  );
  await del("person", () =>
    exec.delete(person).where(inArray(person.organizationId, orgIds)),
  );

  // Better Auth membership rows, scoped by the seed org id.
  await del("member", () =>
    exec.delete(member).where(inArray(member.organizationId, orgIds)),
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
    exec.delete(organization).where(inArray(organization.id, orgIds)),
  );

  return report;
}

/** Per-academy presence + a few row counts, for `seed status`. */
interface SeedAcademyStatus {
  key: string;
  academyId: string;
  name: string;
  present: boolean;
  members: number;
  classes: number;
  memberships: number;
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
    const memberships = await exec
      .select({ n: count() })
      .from(accessAssignment)
      .where(eq(accessAssignment.organizationId, a.id));
    result.push({
      key: a.key,
      academyId: a.id,
      name: a.name,
      present: org.length > 0,
      members: members[0]?.n ?? 0,
      classes: classes[0]?.n ?? 0,
      memberships: memberships[0]?.n ?? 0,
    });
  }
  return result;
}
