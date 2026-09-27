"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";
import { Label } from "@matops/ui/label";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";
import { MembershipPolicySchema } from "@matops/validators";

import { useTRPC } from "~/trpc/react";
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
      <SettingsSection index={3} title="Memberships" blurb={MEMBERSHIP_BLURB}>
        <SkeletonRows rows={3} lines={2} inList />
      </SettingsSection>
    );
  if (policy.isError) {
    return (
      <SettingsSection index={3} title="Memberships" blurb={MEMBERSHIP_BLURB}>
        <ErrorState
          label="your membership settings"
          onRetry={() => void policy.refetch()}
        />
      </SettingsSection>
    );
  }

  const saved = policy.data;
  return (
    <SettingsSection index={3} title="Memberships" blurb={MEMBERSHIP_BLURB}>
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
