"use client";

import { isBjjAcademy, isOwner } from "@matops/domain";
import { cn } from "@matops/ui";

import { AcademyDangerZone } from "./academy-danger-zone";
import { AcademyIdentity } from "./academy-identity";
import { AcademyLocation } from "./academy-location";
import { useEntity } from "./entity";
import { PageHeader } from "./page-header";
import { ENTER } from "./primitives";
import { PublicBooking } from "./public-booking";

export function SettingsScreen() {
  const academy = useEntity();
  const bjj = isBjjAcademy(academy.type);

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={
          bjj
            ? "This academy: name, join code, time zone, where you train, the booking rule, and public booking."
            : "This space: name, join code, time zone and where it is."
        }
      />
      <div className={cn("flex flex-col gap-8", ENTER)}>
        <AcademyIdentity name={academy.name} code={academy.code} />
        <AcademyLocation address={academy.address} mapUrl={academy.mapUrl} />
        {bjj && <PublicBooking academyName={academy.name} />}
        {isOwner(academy) && <AcademyDangerZone name={academy.name} />}
      </div>
    </>
  );
}
