import type { DbReader, TenantTx } from "@matops/db";
import type { BookingAccess } from "@matops/domain";
import { and, eq } from "@matops/db";
import { memberDues, paymentClaim } from "@matops/db/schema";
import {
  accessAdmits,
  accessReason,
  bookingAccess,
  bookingAccessMessage,
  isActiveMember,
  isStaff,
} from "@matops/domain";

import { loadMembershipAccess } from "./membership-access";
import { readPaymentSettings } from "./payments-read";

/**
 * One gate decides, never two (ADR 126).
 *
 * A branch runs on exactly one of them. `membership_enforced_at` null means the
 * LEGACY per-branch dues gate still decides there, which is how an existing
 * academy keeps working untouched until its owner activates the new one
 * deliberately. A timestamp means shared memberships decide, and the legacy
 * dues rows stay in the database as history without gating anything.
 *
 * The entity is a REQUIRED argument rather than an optional one on purpose: a
 * caller that forgot it would silently apply the legacy gate at an activated
 * branch, which is the exact mistake this seam exists to prevent.
 */
export interface GatedEntity {
  id: string;
  name: string;
  membershipEnforcedAt: Date | null;
}

const OPEN_ACCESS: BookingAccess = {
  state: "ok",
  reason: null,
  daysUntilLock: null,
};

/**
 * The LEGACY branch dues state, for the screens that still show it.
 *
 * Answers `ok` at an activated branch, whatever the dues rows say: the shared
 * membership decides there, and a second opinion on the same screen would be a
 * lock nobody can clear.
 */
export async function loadBookingAccess(
  db: DbReader,
  membership: { role: string; joinedAt: Date; memberId: string | null },
  entity: Pick<GatedEntity, "membershipEnforcedAt">,
): Promise<BookingAccess> {
  if (entity.membershipEnforcedAt) return OPEN_ACCESS;
  const memberId = membership.memberId;
  if (membership.role !== "student" || !memberId) return OPEN_ACCESS;
  const settings = await readPaymentSettings(db);
  if (!settings.enforcedAt) return OPEN_ACCESS;

  const dues = (
    await db
      .select({ nextDueAt: memberDues.nextDueAt })
      .from(memberDues)
      .where(eq(memberDues.memberId, memberId))
      .limit(1)
  )[0];
  const openClaim = dues
    ? (
        await db
          .select({ id: paymentClaim.id })
          .from(paymentClaim)
          .where(
            and(
              eq(paymentClaim.memberId, memberId),
              eq(paymentClaim.status, "pending"),
            ),
          )
          .limit(1)
      )[0]
    : undefined;

  return bookingAccess(
    {
      enforcedAt: settings.enforcedAt,
      graceDays: settings.graceDays,
      memberSince: membership.joinedAt,
      nextDueAt: dues?.nextDueAt ?? null,
      hasOpenClaim: !!openClaim,
    },
    new Date(),
  );
}

export interface BookingGate {
  locked: boolean;
  /** What to tell them, or null when nothing is in the way. */
  message: string | null;
}

/**
 * May this person book, under whichever gate their branch runs on?
 *
 * Takes the class's start so an activated branch can answer for the session as
 * well as for now: booking three weeks ahead on a membership that runs out next
 * Tuesday is refused at the point of booking rather than discovered at the door.
 *
 * ACTIVE STAFF are never gated, under either gate, which is the rule the legacy
 * path has always followed in `loadBookingAccess`. A coach or an owner runs the
 * place rather than buying access to it, and a gym that had just activated
 * memberships would otherwise lock its own staff out of the class they teach.
 * `isStaff` requires an ACTIVE branch membership, so the branch still decides:
 * somebody suspended or not yet approved is refused whatever their role says.
 */
export async function bookingGate(
  db: TenantTx,
  input: {
    entity: GatedEntity;
    membership: {
      role: string;
      status: string;
      joinedAt: Date;
      memberId: string | null;
    };
    userId: string;
    sessionAt?: Date;
  },
): Promise<BookingGate> {
  if (!isActiveMember(input.membership)) {
    return {
      locked: true,
      message: `${input.entity.name} has not approved you yet. You can browse classes while you wait.`,
    };
  }

  if (input.entity.membershipEnforcedAt) {
    if (isStaff(input.membership)) return { locked: false, message: null };
    const seen = await loadMembershipAccess(db, {
      userId: input.userId,
      entityId: input.entity.id,
      membership: { status: input.membership.status },
      now: new Date(),
      sessionAt: input.sessionAt,
    });
    // Both moments have to pass. `now` is whether they may act at all, and
    // `atSession` is whether the membership still reaches the class.
    const verdict = accessAdmits(seen.now) ? seen.atSession : seen.now;
    return accessAdmits(verdict)
      ? { locked: false, message: null }
      : { locked: true, message: accessReason(verdict, input.entity.name) };
  }

  const access = await loadBookingAccess(db, input.membership, input.entity);
  return access.state === "locked"
    ? {
        locked: true,
        message: bookingAccessMessage(access) ?? "Booking is locked for you.",
      }
    : { locked: false, message: null };
}
