"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { Label } from "@matops/ui/label";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";
import { MembershipPolicySchema } from "@matops/validators";

import { useTRPC } from "~/trpc/react";
import { useEntity } from "./entity";
import {
  ENTER,
  LIST,
  SectionHeading,
  SettingsRow,
  stagger,
} from "./primitives";
import { SkeletonRows } from "./skeletons";
import { ErrorState } from "./states";

/**
 * One settings section. The heading and its blurb stay put while the query
 * behind the section loads, so nothing below them jumps when it lands, and
 * `index` places the section in the page's entrance.
 */
function SettingsSection({
  index,
  title,
  blurb,
  children,
}: {
  index: number;
  title: string;
  blurb?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      style={stagger(index)}
      className={cn(ENTER, "flex flex-col gap-3")}
    >
      <div className="flex flex-col gap-1">
        <SectionHeading>{title}</SectionHeading>
        {blurb && <p className="text-muted-foreground text-sm">{blurb}</p>}
      </div>
      {children}
    </section>
  );
}

const SWITCH_BLURB =
  "Set up plans and bank details first. Students see them only after you turn payments on.";

function uncoveredLine(names: string[]) {
  if (names.length === 0) return "Every active student has a plan.";
  const shown = names.slice(0, 5).join(", ");
  const rest = names.length - Math.min(names.length, 5);
  const who = names.length === 1 ? "student has" : "students have";
  return `${names.length} ${who} no plan yet and will stop being able to book: ${shown}${rest > 0 ? ` and ${rest} more` : ""}.`;
}

/** The owner's switch for `entity.membership_enforced_at` (ADR 154). */
export function MembershipPaymentsSwitch() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const academy = useEntity();
  const on = academy.membershipEnforced;
  const uncovered = useQuery({
    ...trpc.accessPlan.uncovered.queryOptions(),
    enabled: !on,
  });
  const flip = useMutation(
    trpc.academy.setMembershipEnforced.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries();
        toast.success(
          result.enforced
            ? "Membership payments are on"
            : "Membership payments are off",
        );
      },
      onError: (e) =>
        toast.error(e.message || "Couldn't change that. Try again."),
    }),
  );
  const names =
    uncovered.data?.groups
      .find((g) => g.entityId === academy.academyId)
      ?.people.map((p) => p.name) ?? [];

  return (
    <SettingsSection index={3} title="Membership payments" blurb={SWITCH_BLURB}>
      <div className={LIST}>
        <SettingsRow
          title={on ? "On" : "Off"}
          description={
            on
              ? "Students need a plan and a paid month to book."
              : "Approved students book without a plan or payment."
          }
        >
          {on ? (
            <ConfirmDialog
              title="Turn membership payments off?"
              description="Students book without a plan again. Plans, months and payment records stay."
              confirmLabel="Turn off"
              variant="primary"
              onConfirm={async () => {
                await flip.mutateAsync({ enforced: false });
              }}
              trigger={
                <Button size="sm" variant="outline" busy={flip.isPending}>
                  Turn off
                </Button>
              }
            />
          ) : (
            <ConfirmDialog
              title="Turn membership payments on?"
              description={
                <>
                  Students then need a plan and a paid month to book. Classes
                  already booked stay booked.{" "}
                  {uncovered.isPending
                    ? "Checking which students have a plan."
                    : uncovered.isError
                      ? "Couldn't check which students have a plan."
                      : uncoveredLine(names)}
                </>
              }
              confirmLabel="Turn on"
              onConfirm={async () => {
                await flip.mutateAsync({ enforced: true });
              }}
              trigger={
                <Button size="sm" busy={flip.isPending}>
                  Turn on
                </Button>
              }
            />
          )}
        </SettingsRow>
      </div>
    </SettingsSection>
  );
}

const MEMBERSHIP_BLURB =
  "Members see these bank details wherever they are told to pay.";

/**
 * `setPolicy` replaces every field, so the grace days and deadline zone go back
 * as they were stored: this form only edits the bank details (ADR 127).
 */
export function MembershipSettings() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const policy = useQuery(trpc.accessPlan.policy.queryOptions());
  // The server's answer IS the starting point, so the draft only exists once
  // somebody types. No effect copies one into the other.
  const [draft, setDraft] = useState<string | null>(null);
  const bankDetails = draft ?? policy.data?.bankDetails ?? "";

  const save = useMutation(
    trpc.accessPlan.setPolicy.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.accessPlan.pathFilter());
        setDraft(null);
        toast.success("Membership settings saved");
      },
      onError: (e) =>
        toast.error(e.message || "Couldn't save that. Try again."),
    }),
  );

  if (policy.isPending)
    return (
      <SettingsSection index={4} title="Memberships" blurb={MEMBERSHIP_BLURB}>
        <SkeletonRows rows={3} lines={2} inList />
      </SettingsSection>
    );
  if (policy.isError) {
    return (
      <SettingsSection index={4} title="Memberships" blurb={MEMBERSHIP_BLURB}>
        <ErrorState
          label="your membership settings"
          onRetry={() => void policy.refetch()}
        />
      </SettingsSection>
    );
  }

  const saved = policy.data;
  return (
    <SettingsSection index={4} title="Memberships" blurb={MEMBERSHIP_BLURB}>
      <form
        className={LIST}
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = MembershipPolicySchema.safeParse({
            graceDays: saved.graceDays,
            calendarTimeZone: saved.calendarTimeZone,
            bankDetails,
          });
          if (!parsed.success) {
            toast.error("Couldn't save that. Check the bank details.");
            return;
          }
          save.mutate(parsed.data);
        }}
      >
        <SettingsRow
          stacked
          title={<Label htmlFor="bank-details">Bank details</Label>}
          description={
            <span id="bank-details-hint">
              Members see this wherever they are told to pay, at every branch.
              They add the reference shown on their own screen to the transfer.
            </span>
          }
        >
          <Textarea
            id="bank-details"
            value={bankDetails}
            rows={4}
            aria-describedby="bank-details-hint"
            placeholder={"Bank: …\nIBAN / Card: …\nRecipient: …"}
            onChange={(e) => setDraft(e.target.value)}
          />
        </SettingsRow>
        <div className="flex justify-end p-4">
          <Button type="submit" busy={save.isPending}>
            Save
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
