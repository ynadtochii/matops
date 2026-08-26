import type { DbReader, Membership } from "@matops/db";
import type { BookingAccess } from "@matops/domain";
import { and, eq } from "@matops/db";
import { memberDues, paymentClaim } from "@matops/db/schema";
import { bookingAccess } from "@matops/domain";

import { readPaymentSettings } from "./payments-read";

const OPEN_ACCESS: BookingAccess = {
  state: "ok",
  reason: null,
  daysUntilLock: null,
};

export async function loadBookingAccess(
  db: DbReader,
  membership: Membership,
): Promise<BookingAccess> {
  if (membership.role !== "student") return OPEN_ACCESS;
  const settings = await readPaymentSettings(db);
  if (!settings.enforcedAt) return OPEN_ACCESS;

  const dues = (
    await db
      .select({ nextDueAt: memberDues.nextDueAt })
      .from(memberDues)
      .where(eq(memberDues.memberId, membership.memberId))
      .limit(1)
  )[0];
  const openClaim = dues
    ? (
        await db
          .select({ id: paymentClaim.id })
          .from(paymentClaim)
          .where(
            and(
              eq(paymentClaim.memberId, membership.memberId),
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
