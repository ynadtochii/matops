"use client";

import Link from "next/link";

import { isOwner } from "@matops/domain";
import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";

import { AcademyDangerZone } from "./academy-danger-zone";
import { AcademyIconSettings } from "./academy-icon-settings";
import { AcademyIdentity } from "./academy-identity";
import { AcademyLocation } from "./academy-location";
import { useEntity, useOrganization } from "./entity";
import { DeskLinkSection } from "./invite-link-card";
import { PageHeader } from "./page-header";
import { ENTER, LIST, SectionHeading, SettingsRow } from "./primitives";
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
        {canRunOrganization && (
          <section className="flex flex-col gap-3">
            <SectionHeading>Payments</SectionHeading>
            <div className={LIST}>
              <SettingsRow
                title={academy.membershipEnforced ? "On" : "Off"}
                description="Membership payments, ways to pay, card payments and days to pay are in Memberships, under Setup."
              >
                <Button size="sm" variant="outline" asChild>
                  <Link href="/memberships?tab=setup">Open Setup</Link>
                </Button>
              </SettingsRow>
            </div>
          </section>
        )}
        {isOwner(academy) && (
          <div className="border-border border-t pt-8">
            <AcademyDangerZone name={academy.name} />
          </div>
        )}
      </div>
    </>
  );
}
