"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { BadgeTone } from "@matops/ui/badge";
import { formatMoney, timeZoneOptions } from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Badge } from "@matops/ui/badge";
import { Button } from "@matops/ui/button";
import { Checkbox } from "@matops/ui/checkbox";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { FOCUS_RING } from "@matops/ui/motion";
import { Select } from "@matops/ui/select";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";
import { MembershipPolicySchema } from "@matops/validators";

import { dateYearFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useOrganization } from "./entity";
import { CONTACT_EMAIL } from "./feedback-link";
import { PageHeader } from "./page-header";
import {
  ENTER,
  LIST,
  SectionHeading,
  SettingsRow,
  stagger,
} from "./primitives";
import { Bar, SkeletonRows } from "./skeletons";
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
      <EmptyState title="Only an owner can change the gym's settings.">
        Ask whoever runs the gym.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Gym settings"
        subtitle="Settings every branch shares. A single branch has its own under Branch settings."
      />
      <GymName />
      <Modules />
      <Account />
      <MembershipSettings />
      <Branches />
    </div>
  );
}

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

const MODULES_BLURB =
  "Turn on only the tools your gym uses. Curriculum and referrals are available at BJJ branches.";

function ModuleToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="hover:bg-hover flex cursor-pointer items-start gap-3 p-4 transition-colors motion-reduce:transition-none">
      <Checkbox
        className="mt-0.5"
        checked={checked}
        onCheckedChange={(next) => onChange(next === true)}
      />
      <span className="flex flex-col gap-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-muted-foreground text-sm">{hint}</span>
      </span>
    </label>
  );
}

function Modules() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const modules = useQuery(trpc.organization.modules.queryOptions());
  const [draft, setDraft] = useState<{
    curriculumEnabled: boolean;
    referralsEnabled: boolean;
  } | null>(null);
  const save = useMutation(
    trpc.organization.setModules.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        setDraft(null);
        toast.success("Features saved");
      },
      onError: (error) =>
        toast.error(error.message || "Couldn't save the features. Try again."),
    }),
  );

  if (modules.isPending)
    return (
      <SettingsSection
        index={1}
        title="Optional features"
        blurb={MODULES_BLURB}
      >
        <SkeletonRows rows={2} lines={2} inList />
      </SettingsSection>
    );
  if (modules.isError) {
    return (
      <SettingsSection
        index={1}
        title="Optional features"
        blurb={MODULES_BLURB}
      >
        <ErrorState
          label="optional features"
          onRetry={() => void modules.refetch()}
        />
      </SettingsSection>
    );
  }

  const shown = draft ?? modules.data;
  return (
    <SettingsSection index={1} title="Optional features" blurb={MODULES_BLURB}>
      <div className={LIST}>
        <ModuleToggle
          label="Curriculum"
          hint="Plan teaching blocks and show class themes."
          checked={shown.curriculumEnabled}
          onChange={(curriculumEnabled) =>
            setDraft({ ...shown, curriculumEnabled })
          }
        />
        <ModuleToggle
          label="Referrals"
          hint="Record who referred each student."
          checked={shown.referralsEnabled}
          onChange={(referralsEnabled) =>
            setDraft({ ...shown, referralsEnabled })
          }
        />
      </div>
      <Button
        className="self-start"
        busy={save.isPending}
        disabled={draft === null}
        onClick={() => save.mutate(shown)}
      >
        Save
      </Button>
    </SettingsSection>
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

/**
 * The account status wears the same pill as `DriftBadge`, for the same reason:
 * "Payment outstanding" set in the muted colour reads as a caption, and the
 * only line on the page that says the gym owes us money should not.
 */
const STATUS_TONE: Record<string, BadgeTone> = {
  active: "success",
  past_due: "warning",
  closed: "error",
};

function Account() {
  const trpc = useTRPC();
  const account = useQuery(trpc.organization.account.queryOptions());
  const now = useMinuteClock();

  if (account.isPending)
    return (
      <SettingsSection index={2} title="Your account">
        <SkeletonRows rows={1} inList />
      </SettingsSection>
    );

  if (account.isError)
    return (
      <SettingsSection index={2} title="Your account">
        <ErrorState
          label="your account"
          onRetry={() => void account.refetch()}
        />
      </SettingsSection>
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
    <SettingsSection index={2} title="Your account">
      <div className={LIST}>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-md font-medium">{OFFER_LABEL[offer] ?? offer}</p>
          <Badge tone={STATUS_TONE[accountStatus] ?? "neutral"}>
            {STATUS_LABEL[accountStatus] ?? accountStatus}
          </Badge>
        </div>

        <dl className="flex flex-col gap-1.5 p-4 text-sm">
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

        <p className="text-muted-foreground p-4 text-sm">
          {ends && !over
            ? "You pay nothing until then. We will talk to you before anything changes."
            : ends && over
              ? "That date has passed. Nothing stops working: we invoice you and you pay by transfer."
              : "There is no card on file. We invoice you and you pay by transfer."}{" "}
          To change any of this, email us at{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("MatOps account")}`}
            className={cn(
              "text-brand-strong rounded-sm underline underline-offset-4",
              FOCUS_RING,
            )}
          >
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </div>
    </SettingsSection>
  );
}

function GymName() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { organizationName } = useOrganization();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(organizationName);
  const [nameError, setNameError] = useState<string | null>(null);

  const rename = useMutation(
    trpc.organization.rename.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.entity.pathFilter());
        toast.success("Gym renamed");
        setEditing(false);
      },
      onError: (e) =>
        toast.error(e.message || "Couldn't rename the gym. Try again."),
    }),
  );

  const save = () => {
    const next = draft.trim();
    if (next.length < 2) {
      setNameError("Use at least 2 characters.");
      return;
    }
    setNameError(null);
    if (next === organizationName) {
      setEditing(false);
      return;
    }
    rename.mutate({ name: next });
  };

  return (
    <SettingsSection
      index={0}
      title="Gym name"
      blurb="This is your gym as a whole. Each branch keeps its own name."
    >
      <div className={LIST}>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          {editing ? (
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <Input
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setNameError(null);
                }}
                maxLength={80}
                autoFocus
                className="w-full sm:w-64"
                aria-label="Gym name"
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? "gym-name-error" : undefined}
              />
              <Button size="sm" busy={rename.isPending} onClick={save}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(organizationName);
                  setNameError(null);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              {nameError && (
                <FieldError id="gym-name-error" className="basis-full">
                  {nameError}
                </FieldError>
              )}
            </div>
          ) : (
            <>
              <p className="text-md min-w-0 truncate font-medium">
                {organizationName}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDraft(organizationName);
                  setNameError(null);
                  setEditing(true);
                }}
              >
                Rename
              </Button>
            </>
          )}
        </div>
      </div>
    </SettingsSection>
  );
}

const MEMBERSHIP_BLURB =
  "A membership month runs from the 1st. An unpaid month still lets somebody train for this many days, then stops.";

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
        <SettingsRow title={<Label htmlFor="grace-days">Days to pay</Label>}>
          <Input
            id="grace-days"
            type="number"
            min={0}
            max={28}
            className="w-24"
            value={shown.graceDays}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "grace-error" : undefined}
            onChange={(e) => {
              setDraft({ ...shown, graceDays: e.target.value });
              setError(null);
            }}
          />
          {error && (
            <FieldError id="grace-error" className="basis-full sm:text-right">
              {error}
            </FieldError>
          )}
        </SettingsRow>
        <SettingsRow
          title={<Label htmlFor="calendar-zone">Time zone for deadlines</Label>}
        >
          <Select
            id="calendar-zone"
            className="w-full sm:w-64"
            value={shown.zone}
            onChange={(e) => setDraft({ ...shown, zone: e.target.value })}
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </Select>
        </SettingsRow>
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
            value={shown.bankDetails}
            rows={4}
            aria-describedby="bank-details-hint"
            placeholder={"Bank: …\nIBAN / Card: …\nRecipient: …"}
            onChange={(e) =>
              setDraft({ ...shown, bankDetails: e.target.value })
            }
          />
        </SettingsRow>
        <div className="flex justify-end p-4">
          <Button type="submit" busy={save.isPending}>
            Save
          </Button>
        </div>
      </form>
      <p className="text-muted-foreground text-sm">
        {saved.graceDays === 0
          ? `An unpaid month blocks booking from the first day of the month, ${saved.effective} time.`
          : `An unpaid month lets somebody train for the first ${saved.graceDays} ${
              saved.graceDays === 1 ? "day" : "days"
            }. Booking stops at 00:00 on the next day, ${saved.effective} time.`}
        {saved.calendarTimeZone === null &&
          " That zone comes from your main branch until you pick one here."}
      </p>
    </SettingsSection>
  );
}

function Branches() {
  const { entities, canCreateBranches } = useOrganization();
  if (entities.length === 0) return null;
  if (!canCreateBranches) return null;
  return (
    <SettingsSection
      index={4}
      title="Payment rules per branch"
      blurb="Choose whether an unpaid member can still book at each branch."
    >
      <ul className={LIST}>
        {entities.map((e) => (
          <li key={e.id}>
            <BranchRow entityId={e.id} name={e.name} />
          </li>
        ))}
      </ul>
    </SettingsSection>
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
        await queryClient.invalidateQueries();
        toast.success(
          result.enforced
            ? `${name} now requires payment to book`
            : `${name} no longer requires payment to book`,
        );
      },
      onError: (e) =>
        toast.error(e.message || "Couldn't change that branch. Try again."),
    }),
  );

  const enforced = preview.data?.enforced ?? false;
  const uncovered = preview.data?.uncovered ?? [];
  const named = uncovered
    .slice(0, 5)
    .map((m) => m.name)
    .join(", ");
  const rest = uncovered.length - Math.min(uncovered.length, 5);
  const futureBookings = preview.data?.futureBookings ?? 0;
  const bookingsLine =
    futureBookings === 0
      ? ""
      : ` ${futureBookings === 1 ? "1 existing booked class stays booked" : `${futureBookings} existing booked classes stay booked`}.`;
  const readiness = preview.data?.readiness;
  const blockers = [
    readiness?.unpricedPlans
      ? `${readiness.unpricedPlans} ${
          readiness.unpricedPlans === 1 ? "plan has" : "plans have"
        } no price`
      : "",
    readiness && !readiness.bankDetails ? "no bank details for the gym" : "",
    readiness?.pendingEnrolment
      ? `${readiness.pendingEnrolment} ${
          readiness.pendingEnrolment === 1
            ? "person on a covering plan is"
            : "people on a covering plan are"
        } not enrolled here yet`
      : "",
  ].filter(Boolean);

  // Until the preview lands, the row says nothing about the rule. `enforced`
  // falls back to false, so stating it while the query is in flight would put
  // "unpaid members can still book here" on a branch that requires payment.
  if (preview.isPending || preview.isError) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name}</p>
          {preview.isError ? (
            <p className="text-muted-foreground text-sm">
              Couldn't load this branch's rule.
            </p>
          ) : (
            <Bar className="mt-1.5 h-3 w-52" />
          )}
        </div>
        {preview.isError ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void preview.refetch()}
          >
            Try again
          </Button>
        ) : (
          <Bar className="h-8 w-44 rounded-md" />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-muted-foreground text-sm">
          {enforced
            ? "Unpaid members can't book classes here."
            : "Unpaid members can still book classes here."}
        </p>
      </div>
      {enforced ? (
        <ConfirmDialog
          title={`Let unpaid members book at ${name}?`}
          description="Everyone keeps their membership. An unpaid month will no longer stop anyone booking here."
          confirmLabel="Stop requiring payment"
          onConfirm={async () => {
            await flip.mutateAsync({ entityId, enforced: false });
          }}
          trigger={
            <Button size="sm" variant="outline" busy={flip.isPending}>
              Stop requiring payment
            </Button>
          }
        />
      ) : (
        <ConfirmDialog
          title={
            uncovered.length === 0
              ? `Require payment to book at ${name}?`
              : `${uncovered.length} ${
                  uncovered.length === 1 ? "member" : "members"
                } would stop being able to book`
          }
          description={
            uncovered.length === 0
              ? `Every active member there is covered by a membership.${
                  blockers.length > 0
                    ? ` Still to sort out: ${blockers.join("; ")}.`
                    : ""
                }`
              : `${named}${rest > 0 ? ` and ${rest} more` : ""} ${
                  uncovered.length === 1 ? "is" : "are"
                } active at ${name} and hold no membership covering it. They cannot book here until you give them one.${bookingsLine}${
                  blockers.length > 0
                    ? ` Also still to sort out: ${blockers.join("; ")}.`
                    : ""
                } You can turn this off at any time.`
          }
          confirmLabel="Require payment"
          variant={uncovered.length === 0 ? "primary" : "destructive"}
          onConfirm={async () => {
            await flip.mutateAsync({ entityId, enforced: true });
          }}
          trigger={
            <Button size="sm" variant="outline" busy={flip.isPending}>
              Require payment to book
            </Button>
          }
        />
      )}
    </div>
  );
}
