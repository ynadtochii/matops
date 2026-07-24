"use client";

import { InviteLinkCard } from "./invite-link-card";
import { SectionHeading } from "./primitives";

/**
 * How students join (spec O6). One shareable student link; the link grants
 * nothing until an owner approves (docs/issues/20). The instructor link lives in
 * the Staff section — adding a coach is a staff action, not a student one.
 */
export function Invites() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <SectionHeading>How students join</SectionHeading>
        <p className="text-muted-foreground text-sm">
          Share this link with members who train. They land pending until you
          approve them — a forwarded link never grants access on its own.
        </p>
      </div>
      <InviteLinkCard
        role="student"
        label="Student link"
        hint="For members who train. They land pending until you approve them."
      />
    </section>
  );
}
