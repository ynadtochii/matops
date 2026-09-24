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
        title="Branch settings"
        subtitle={`Settings for ${academy.name} alone. Everything your whole gym shares lives in Gym settings.`}
      />
      <div className={cn("flex flex-col gap-10", ENTER)}>
        <AcademyIdentity name={academy.name} code={academy.code} />
        <AcademyLocation address={academy.address} mapUrl={academy.mapUrl} />
        {bjj && <PublicBooking academyName={academy.name} />}
        {isOwner(academy) && (
          <div className="border-border border-t pt-8">
            <AcademyDangerZone name={academy.name} />
          </div>
        )}
      </div>
    </>
  );
}
