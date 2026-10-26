"use client";

import { isOwner } from "@matops/domain";
import { cn } from "@matops/ui";

import { AcademyDangerZone } from "./academy-danger-zone";
import { AcademyIconSettings } from "./academy-icon-settings";
import { AcademyIdentity } from "./academy-identity";
import { AcademyLocation } from "./academy-location";
import { useEntity, useOrganization } from "./entity";
import { DeskLinkSection } from "./invite-link-card";
import {
  MembershipPaymentsSwitch,
  MembershipSettings,
} from "./membership-settings";
import { PageHeader } from "./page-header";
import { ENTER } from "./primitives";
import { SignupQuestions } from "./signup-questions";

export function SettingsScreen() {
  const academy = useEntity();
  const { canRunOrganization } = useOrganization();

  return (
    <>
      <PageHeader title="Settings" subtitle={`Settings for ${academy.name}.`} />
      <div className={cn("flex flex-col gap-10", ENTER)}>
        <AcademyIdentity name={academy.name} code={academy.code} />
        <AcademyIconSettings name={academy.name} iconUrl={academy.iconUrl} />
        <AcademyLocation address={academy.address} mapUrl={academy.mapUrl} />
        <SignupQuestions />
        <DeskLinkSection />
        {isOwner(academy) && <MembershipPaymentsSwitch />}
        {canRunOrganization && <MembershipSettings />}
        {isOwner(academy) && (
          <div className="border-border border-t pt-8">
            <AcademyDangerZone name={academy.name} />
          </div>
        )}
      </div>
    </>
  );
}
