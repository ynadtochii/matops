"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { formatMoney, timeZoneOptions } from "@matops/domain";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Select } from "@matops/ui/select";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";
import { MembershipPolicySchema } from "@matops/validators";

import { dateYearFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useOrganization } from "./entity";
import { PageHeader } from "./page-header";
import { cardClass, ENTER, Eyebrow } from "./primitives";
import { SkeletonRows } from "./skeletons";
import { EmptyState, ErrorState } from "./states";
import { useMinuteClock } from "./use-clock";

/**
 * The gym's own settings (ADR 127): its name, where members pay, and how long
 * an unpaid month still admits.
 *
 * These belong to the organization rather than to a branch, for the reason
 * ADR 126 gave the grace days: one membership covering a mat and a gym has to
 * have one answer, and a per-branch setting would give it two.
 */
export function OrganizationSettingsScreen() {
  const { canRunOrganization } = useOrganization();

  if (!canRunOrganization) {
    return (
      <EmptyState title="Only an owner can change the organization's settings.">
        Ask whoever runs it.
      </EmptyState>
    );
  }

  return (
    <div className={`${ENTER} flex flex-col gap-8`}>
      <PageHeader
        title="Settings"
        subtitle="Your organization: its name, where members pay, and any branch still to move onto memberships."
      />
      <GymName />
      <Account />
      <MembershipSettings />
      <Branches />
    </div>
  );
}

const OFFER_LABEL: Record<string, string> = {
  pilot: "Pilot",
  academy: "Academy",
  facility: "Facility",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  past_due: "Payment outstanding",
  closed: "Closed",
};

function Account() {
  const trpc = useTRPC();
  const account = useQuery(trpc.organization.account.queryOptions());
  const now = useMinuteClock();

  if (account.isPending)
    return (
      <section className="flex flex-col gap-3">
        <Eyebrow>Your account</Eyebrow>
        <SkeletonRows rows={1} />
      </section>
    );

  if (account.isError)
    return (
      <section className="flex flex-col gap-3">
        <Eyebrow>Your account</Eyebrow>
        <ErrorState
          label="your account"
          onRetry={() => void account.refetch()}
        />
      </section>
    );

  const {
    offer,
    pilotEndsOn,
    agreedPriceMinor,
    agreedPriceCurrency,
    billingContact,
    accountStatus,
  } = account.data;
  const ends = pilotEndsOn ? new Date(`${pilotEndsOn}T00:00:00`) : null;
  const over = ends !== null && ends.getTime() < now.getTime();
  const dateLabel = offer === "pilot" ? "Free until" : "Trial ends";

  return (
    <section className="flex flex-col gap-3">
      <Eyebrow>Your account</Eyebrow>
      <div className={`${cardClass()} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-base font-medium">{OFFER_LABEL[offer] ?? offer}</p>
          <p className="text-muted-foreground text-sm">
            {STATUS_LABEL[accountStatus] ?? accountStatus}
          </p>
        </div>

        <dl className="flex flex-col gap-1.5 text-sm">
          {ends && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">{dateLabel}</dt>
              <dd className={over ? "text-warning" : undefined}>
                {dateYearFmt.format(ends)}
                {over && " (passed)"}
              </dd>
            </div>
          )}
          {agreedPriceMinor !== null && agreedPriceCurrency !== null && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">Agreed price</dt>
              <dd>
                {formatMoney(agreedPriceMinor, agreedPriceCurrency)} a month
              </dd>
            </div>
          )}
          {billingContact && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">Billing contact</dt>
              <dd className="break-all">{billingContact}</dd>
            </div>
          )}
        </dl>

        <p className="text-muted-foreground text-sm">
          {ends && !over
            ? "You pay nothing until then. We will talk to you before anything changes."
            : "There is no card on file. We invoice you and you pay by transfer."}{" "}
          To change any of this, reply to us by email.
        </p>
      </div>
    </section>
  );
}

function GymName() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { organizationName } = useOrganization();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(organizationName);

  const rename = useMutation(
    trpc.organization.rename.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.entity.pathFilter());
        toast.success("Organization renamed");
        setEditing(false);
      },
      onError: (e) =>
        toast.error(e.message || "Could not rename the organization"),
    }),
  );

  const save = () => {
    const next = draft.trim();
    if (next.length < 2) {
      toast.error("Name must be at least 2 characters");
      return;
    }
    if (next === organizationName) {
      setEditing(false);
      return;
    }
    rename.mutate({ name: next });
  };

  return (
    <section className={`${cardClass()} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {editing ? (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={80}
              autoFocus
              className="max-w-xs"
              aria-label="Organization name"
            />
            <Button size="sm" onClick={save} disabled={rename.isPending}>
              {rename.isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft(organizationName);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <>
            <div>
              <Eyebrow>Organization name</Eyebrow>
              <p className="mt-1 text-base font-medium">{organizationName}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDraft(organizationName);
                setEditing(true);
              }}
            >
              Rename
            </Button>
          </>
        )}
      </div>
      <p className="text-muted-foreground text-sm">
        This is the organization as a whole. Each branch keeps its own name.
      </p>
    </section>
  );
}

/**
 * Grace, the deadline zone and the bank account, in one form with one Save.
 *
 * One form on purpose: `setPolicy` replaces every field, so two forms writing
 * it would blank each other's (ADR 127).
 */
function MembershipSettings() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const policy = useQuery(trpc.accessPlan.policy.queryOptions());
  // The server's answer IS the starting point, so the draft only exists once
  // somebody types. No effect copies one into the other.
  const [draft, setDraft] = useState<{
    graceDays: string;
    zone: string;
    bankDetails: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = draft ?? {
    graceDays: String(policy.data?.graceDays ?? ""),
    zone: policy.data?.calendarTimeZone ?? policy.data?.suggested ?? "",
    bankDetails: policy.data?.bankDetails ?? "",
  };
  const zones = useMemo(
    () => timeZoneOptions(shown.zone || null),
    [shown.zone],
  );

  const save = useMutation(
    trpc.accessPlan.setPolicy.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.accessPlan.pathFilter());
        setDraft(null);
        toast.success("Membership settings saved");
      },
      onError: (e) => toast.error(e.message || "Could not save that"),
    }),
  );

  if (policy.isPending) return <SkeletonRows rows={2} />;
  if (policy.isError) {
    return (
      <ErrorState
        label="your membership settings"
        onRetry={() => void policy.refetch()}
      />
    );
  }

  const saved = policy.data;

  return (
    <section className={`${cardClass()} flex flex-col gap-4`}>
      <div className="flex flex-col gap-1">
        <Eyebrow>Memberships</Eyebrow>
        <p className="text-muted-foreground text-sm">
          A membership month runs from the 1st. An unpaid month still lets
          somebody train for this many days, then stops.
        </p>
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = MembershipPolicySchema.safeParse({
            graceDays: Number(shown.graceDays),
            calendarTimeZone: shown.zone || null,
            bankDetails: shown.bankDetails,
          });
          if (!parsed.success) {
            setError("Give a number of days from 0 to 28.");
            return;
          }
          setError(null);
          save.mutate(parsed.data);
        }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex w-28 flex-col gap-1.5">
            <Label htmlFor="grace-days">Grace days</Label>
            <Input
              id="grace-days"
              type="number"
              min={0}
              max={28}
              value={shown.graceDays}
              aria-invalid={error ? true : undefined}
              onChange={(e) => {
                setDraft({ ...shown, graceDays: e.target.value });
                setError(null);
              }}
            />
          </div>
          <div className="flex min-w-52 flex-1 flex-col gap-1.5">
            <Label htmlFor="calendar-zone">Time zone for deadlines</Label>
            <Select
              id="calendar-zone"
              value={shown.zone}
              onChange={(e) => setDraft({ ...shown, zone: e.target.value })}
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {error && <FieldError id="grace-error">{error}</FieldError>}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bank-details">Bank details</Label>
          <Textarea
            id="bank-details"
            value={shown.bankDetails}
            rows={4}
            placeholder={"Bank: …\nIBAN / Card: …\nRecipient: …"}
            onChange={(e) =>
              setDraft({ ...shown, bankDetails: e.target.value })
            }
          />
          <p className="text-muted-foreground text-sm">
            Members see this wherever they are told to pay, at every branch.
            They add the reference shown on their own screen to the transfer.
          </p>
        </div>

        <div>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
      <p className="text-muted-foreground text-sm">
        With {saved.graceDays} {saved.graceDays === 1 ? "day" : "days"}, an
        unpaid September lets somebody in until the {saved.graceDays + 1}th at
        midnight in {saved.effective}.
        {saved.calendarTimeZone === null &&
          " That zone comes from your main branch until you pick one here."}
      </p>
    </section>
  );
}

/**
 * Moving a branch off its old dues, one branch at a time (ADR 127, spec FP5).
 *
 * NOT a permanent switch board. A branch is listed only while it is part of
 * the migration: one still on branch dues, which is the move, or one already
 * moved that still has its old dues history, which is the rollback the pilot
 * depends on. A branch opened after the cutover has neither and is never
 * listed, because for it there is nothing to move and nothing to go back to.
 *
 * Turning it ON is the one action here that can stop a paying member booking
 * tomorrow, so it opens a preview naming who that would be, what it would
 * cancel, and what is still unfinished.
 */
function Branches() {
  const { entities, canCreateBranches } = useOrganization();
  if (entities.length === 0) return null;
  // Switching a branch between the two payment gates is owner-only (spec FP7),
  // so a manager is not shown a switch the server would refuse.
  if (!canCreateBranches) return null;
  return (
    <ul className="flex flex-col gap-2">
      {entities.map((e) => (
        <li key={e.id}>
          <BranchRow entityId={e.id} name={e.name} />
        </li>
      ))}
    </ul>
  );
}

function BranchRow({ entityId, name }: { entityId: string; name: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const preview = useQuery(
    trpc.entity.activationPreview.queryOptions({ entityId }),
  );

  const flip = useMutation(
    trpc.entity.setMembershipEnforced.mutationOptions({
      onSuccess: async (result) => {
        // The gate is carried on `academy.current`, which every branch screen
        // reads, so nothing narrower would leave the other tabs honest.
        await queryClient.invalidateQueries();
        toast.success(
          result.enforced
            ? `${name} runs on memberships`
            : `${name} is back on branch dues`,
        );
      },
      onError: (e) => toast.error(e.message || "Could not switch that branch"),
    }),
  );

  const enforced = preview.data?.enforced ?? false;
  // Nothing to move and nothing to roll back to: a branch born on memberships
  // is not part of the migration and gets no row at all (spec FP5).
  if (preview.data && enforced && !preview.data.hasLegacyDues) return null;
  const uncovered = preview.data?.uncovered ?? [];
  const named = uncovered
    .slice(0, 5)
    .map((m) => m.name)
    .join(", ");
  const rest = uncovered.length - Math.min(uncovered.length, 5);
  // What switching on takes away, not just who it takes it from: a member who
  // turns up to a class they had booked is the failure this warns about.
  const futureBookings = preview.data?.futureBookings ?? 0;
  const bookingsLine =
    futureBookings === 0
      ? ""
      : ` ${futureBookings === 1 ? "1 booked class" : `${futureBookings} booked classes`} still to come would be cancelled.`;
  // The blockers an owner can drive to zero, each named so "not ready" says
  // what to do about it (spec FP8).
  const readiness = preview.data?.readiness;
  const blockers = [
    readiness?.unpricedPlans
      ? `${readiness.unpricedPlans} ${
          readiness.unpricedPlans === 1 ? "plan has" : "plans have"
        } no price`
      : "",
    readiness && !readiness.bankDetails
      ? "no bank details for the organization"
      : "",
    readiness?.pendingEnrolment
      ? `${readiness.pendingEnrolment} covered ${
          readiness.pendingEnrolment === 1 ? "person is" : "people are"
        } not enrolled here yet`
      : "",
  ].filter(Boolean);

  return (
    <div
      className={`${cardClass()} flex flex-wrap items-center justify-between gap-3`}
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{name}</p>
        <p className="text-muted-foreground text-sm">
          {enforced
            ? "Moved to memberships. Its old dues are still here if you need to go back."
            : "Still on its own dues. Moving it puts every member on the organization's memberships."}
        </p>
      </div>
      {enforced ? (
        <ConfirmDialog
          title="Hand this branch back to branch dues?"
          description="Its own dues, plans and claims decide access again. Nothing about the memberships covering it is deleted."
          confirmLabel="Switch off"
          onConfirm={async () => {
            await flip.mutateAsync({ entityId, enforced: false });
          }}
          trigger={
            <Button size="sm" variant="outline" busy={flip.isPending}>
              Switch off
            </Button>
          }
        />
      ) : (
        <ConfirmDialog
          title={
            uncovered.length === 0
              ? `Switch ${name} onto memberships?`
              : `${uncovered.length} ${
                  uncovered.length === 1 ? "member" : "members"
                } would stop being able to book`
          }
          description={
            uncovered.length === 0
              ? `Every active member there is covered by a membership. Their branch dues stop deciding access from now on, and the Payments screen for this branch goes away.${
                  blockers.length > 0
                    ? ` Still to sort out: ${blockers.join(", ")}.`
                    : ""
                }`
              : `${named}${rest > 0 ? ` and ${rest} more` : ""} ${
                  uncovered.length === 1 ? "is" : "are"
                } active at ${name} and hold no membership covering it. Switching on stops them booking until you give them one.${bookingsLine}${
                  blockers.length > 0
                    ? ` Also still to sort out: ${blockers.join(", ")}.`
                    : ""
                } You can switch back at any time.`
          }
          confirmLabel="Switch on"
          variant={uncovered.length === 0 ? "primary" : "destructive"}
          onConfirm={async () => {
            await flip.mutateAsync({ entityId, enforced: true });
          }}
          trigger={
            <Button
              size="sm"
              variant="outline"
              busy={flip.isPending}
              disabled={preview.isPending}
            >
              Switch on
            </Button>
          }
        />
      )}
    </div>
  );
}
