"use client";

import { useAcademy } from "./academy";
import { AcademyDangerZone } from "./academy-danger-zone";
import { AcademyIdentity } from "./academy-identity";
import { AcademyLocation } from "./academy-location";
import { PageHeader } from "./page-header";

/**
 * Settings screen (IA ticket 02, spec O6) — the academy itself: rename it, read
 * its code, set the time zone and address, delete it (ADR 68). Everything that
 * belongs to a job lives with that job now: staff and
 * the instructor link on Coaches, the student link and the check-in poster on
 * Members, bank details on Payments. Owner-only (guarded by the nav + server
 * procedures).
 */
export function SettingsScreen() {
  const academy = useAcademy();

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Your academy: name, code, time zone, and where you train."
      />
      <div className="flex flex-col gap-8">
        <AcademyIdentity name={academy.name} code={academy.code} />
        <AcademyLocation address={academy.address} mapUrl={academy.mapUrl} />
        <AcademyDangerZone name={academy.name} />
      </div>
    </>
  );
}
