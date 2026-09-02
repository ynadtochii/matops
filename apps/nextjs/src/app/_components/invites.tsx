"use client";

import { isOwner } from "@matops/domain";

import { useEntity } from "./entity";
import { InviteLinkCard } from "./invite-link-card";
import { SectionHeading } from "./primitives";

/**
 * How students join (spec O6). One shareable student link; the link grants
 * nothing until an owner approves (docs/issues/20). The instructor link lives on
 * the Coaches screen — adding a coach is a staff action, not a student one.
 */
export function Invites() {
  // `invite.list` and `invite.create` stay owner-only, and /members is a staff
  // route now (ADR 75), so the section hides itself rather than 403 a coach.
  const academy = useEntity();
  if (!isOwner(academy)) return null;
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
