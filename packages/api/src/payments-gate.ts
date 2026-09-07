import type { TenantTx } from "@matops/db";
import {
  accessAdmits,
  accessReason,
  isActiveMember,
  isStaff,
} from "@matops/domain";

import { loadMembershipAccess } from "./membership-access";

export interface GatedEntity {
  id: string;
  name: string;
  membershipEnforcedAt: Date | null;
}

export interface BookingGate {
  locked: boolean;
  /** What to tell them, or null when nothing is in the way. */
  message: string | null;
}

export async function bookingGate(
  db: TenantTx,
  input: {
    entity: GatedEntity;
    membership: {
      personId: string | null;
      role: string;
      status: string;
      joinedAt: Date;
      memberId: string | null;
    };
    accountUserId: string | null;
    sessionAt?: Date;
  },
): Promise<BookingGate> {
  if (!isActiveMember(input.membership)) {
    return {
      locked: true,
      message: `${input.entity.name} has not approved you yet. You can browse classes while you wait.`,
    };
  }

  if (!input.entity.membershipEnforcedAt || isStaff(input.membership)) {
    return { locked: false, message: null };
  }
  const seen = await loadMembershipAccess(db, {
    personId: input.membership.personId ?? input.accountUserId ?? "",
    accountUserId: input.accountUserId,
    entityId: input.entity.id,
    membership: { status: input.membership.status },
    now: new Date(),
    sessionAt: input.sessionAt,
  });
  const verdict = accessAdmits(seen.now) ? seen.atSession : seen.now;
  return accessAdmits(verdict)
    ? { locked: false, message: null }
    : { locked: true, message: accessReason(verdict, input.entity.name) };
}
