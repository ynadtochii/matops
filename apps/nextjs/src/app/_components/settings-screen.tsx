"use client";

import { isBjjAcademy, isOwner } from "@matops/domain";

import { AcademyDangerZone } from "./academy-danger-zone";
import { AcademyIdentity } from "./academy-identity";
import { AcademyLocation } from "./academy-location";
import { BookingGate } from "./booking-gate";
import { useEntity } from "./entity";
import { PageHeader } from "./page-header";
import { PublicBooking } from "./public-booking";

/**
 * Settings screen (IA ticket 02, spec O6) — the branch itself: rename it, read
 * its code, set the time zone and address, set the booking rule (ADR 82),
 * delete it (ADR 68). Everything that belongs to a job lives with that job now:
 * staff and the instructor link on Coaches, the student link and the check-in
 * poster on Members, bank details on Payments. Owners and managers (guarded by
 * the nav + server procedures); deleting the branch stays with owners
 * (ADR 129).
 *
 * Two blocks are conditional (ADR 126). Public booking is a BJJ thing: a general
 * space has no visitor path in this release, and its settings live on the
 * `academy_profile` row a general space does not have. The legacy booking gate
 * is hidden wherever shared memberships decide access, because the server stops
 * consulting it there and a setting nothing reads is worse than no setting.
 */
export function SettingsScreen() {
  const academy = useEntity();
  const bjj = isBjjAcademy(academy.type);

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={
          bjj
            ? "Your academy: name, code, time zone, where you train, the booking rule, and public booking."
            : "Your branch: name, code, time zone and where it is."
        }
      />
      <div className="flex flex-col gap-8">
        <AcademyIdentity name={academy.name} code={academy.code} />
        <AcademyLocation address={academy.address} mapUrl={academy.mapUrl} />
        {/* The legacy booking gate belongs to branch dues, so it follows the
            same rule as the Payments screen: not on a branch that has moved,
            and never on one that never ran them (ADR 128). */}
        {!academy.membershipEnforced && academy.hasLegacyDues && (
          <BookingGate />
        )}
        {bjj && <PublicBooking academyName={academy.name} />}
        {isOwner(academy) && <AcademyDangerZone name={academy.name} />}
      </div>
    </>
  );
}
