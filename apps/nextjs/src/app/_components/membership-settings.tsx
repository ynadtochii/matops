"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { isOwner } from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { Callout } from "@matops/ui/callout";
import { CopyButton } from "@matops/ui/copy-button";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";
import {
  MembershipPolicySchema,
  SaveStripeHookSecretSchema,
} from "@matops/validators";

import { dateFmt } from "~/lib/format";
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

const HOOK_BLURB =
  "Mark months paid automatically. Your own Stripe tells MatOps when a student pays through a plan's payment link. It takes about five minutes, once.";

const STRIPE_WEBHOOKS_URL = "https://dashboard.stripe.com/webhooks";
const HOOK_EVENT = "checkout.session.completed";

const HOOK_PROBLEMS: Record<string, { title: string; fix: string }> = {
  bad_signature: {
    title: "The signing secret does not match",
    fix: "Stripe sent a message, but it was signed with a different secret. Open this endpoint in Stripe, reveal its signing secret, and save it here again.",
  },
  test_event: {
    title: "Stripe sent a test-mode message",
    fix: "Real payments need the webhook in live mode. In Stripe, turn off Test mode, add the endpoint there, and save its signing secret here.",
  },
};

function SetupStep({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children?: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="bg-surface-1 text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums">
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-sm font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

function CopyValue({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="bg-surface-1 min-w-0 flex-1 rounded px-2 py-1 text-xs break-all">
        {value}
      </code>
      <CopyButton value={value} label={label} />
    </div>
  );
}

export function CardPaymentHookSection() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const owner = isOwner(useEntity());
  const hook = useQuery(trpc.cardPayment.hook.queryOptions());
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries(trpc.cardPayment.hook.pathFilter());
  const onError = (e: { message: string }) =>
    toast.error(e.message || "Couldn't save that. Try again.");

  const start = useMutation(
    trpc.cardPayment.startHook.mutationOptions({ onSuccess: refresh, onError }),
  );
  const save = useMutation(
    trpc.cardPayment.saveSecret.mutationOptions({
      onSuccess: async () => {
        setSecret("");
        await refresh();
        toast.success("Signing secret saved");
      },
      onError,
    }),
  );
  const remove = useMutation(
    trpc.cardPayment.removeHook.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success("Automatic confirmation turned off");
      },
      onError,
    }),
  );

  if (hook.isPending) {
    return (
      <SettingsSection index={4} title="Card payments" blurb={HOOK_BLURB}>
        <SkeletonRows rows={1} lines={2} inList />
      </SettingsSection>
    );
  }
  if (hook.isError) {
    return (
      <SettingsSection index={4} title="Card payments" blurb={HOOK_BLURB}>
        <ErrorState
          label="card payment settings"
          onRetry={() => void hook.refetch()}
        />
      </SettingsSection>
    );
  }
  if (!hook.data.configured) return null;
  const { state, url, lastEventAt, lastProblem } = hook.data;
  const problem = lastProblem ? HOOK_PROBLEMS[lastProblem] : undefined;

  const secretForm = owner && (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = SaveStripeHookSecretSchema.safeParse({ secret });
        if (!parsed.success) {
          setError("Paste the signing secret that starts with whsec_");
          return;
        }
        setError(null);
        save.mutate(parsed.data);
      }}
    >
      <Label htmlFor="stripe-hook-secret" className="sr-only">
        Signing secret
      </Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="stripe-hook-secret"
          type="password"
          autoComplete="off"
          className="min-w-0 flex-1"
          value={secret}
          placeholder="whsec_…"
          onChange={(e) => setSecret(e.target.value)}
        />
        <Button type="submit" size="sm" busy={save.isPending}>
          Save secret
        </Button>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </form>
  );

  const turnOff = owner && (
    <ConfirmDialog
      title="Turn off automatic confirmation?"
      description="MatOps stops reading payments from your Stripe. Delete the endpoint in your Stripe Dashboard too. Payment links keep working, and staff confirm months by hand."
      confirmLabel="Turn off"
      onConfirm={async () => {
        await remove.mutateAsync();
      }}
      trigger={
        <Button size="sm" variant="outline" busy={remove.isPending}>
          Turn off
        </Button>
      }
    />
  );

  if (state === "none" || !url) {
    return (
      <SettingsSection index={4} title="Card payments" blurb={HOOK_BLURB}>
        <div className={LIST}>
          <SettingsRow
            title="Off"
            description="Staff confirm card payments by hand with Mark paid."
          >
            {owner && (
              <Button
                size="sm"
                busy={start.isPending}
                onClick={() => start.mutate()}
              >
                Set up
              </Button>
            )}
          </SettingsRow>
        </div>
      </SettingsSection>
    );
  }

  if (state === "needs_secret") {
    return (
      <SettingsSection index={4} title="Card payments" blurb={HOOK_BLURB}>
        <div className={cn(LIST, "flex flex-col gap-5 p-4")}>
          <ol className="flex flex-col gap-5">
            <SetupStep n={1} title="Open webhooks in your Stripe Dashboard">
              <p className="text-muted-foreground text-sm">
                Use live mode for real payments. Test mode is only for trying it
                out.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                asChild
              >
                <a
                  href={STRIPE_WEBHOOKS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Stripe webhooks
                </a>
              </Button>
            </SetupStep>
            <SetupStep n={2} title="Add an endpoint with this URL">
              <CopyValue value={url} label="Copy URL" />
            </SetupStep>
            <SetupStep n={3} title="Choose this one event">
              <CopyValue value={HOOK_EVENT} label="Copy event" />
            </SetupStep>
            <SetupStep
              n={4}
              title="Reveal the endpoint's signing secret and paste it here"
            >
              {secretForm}
            </SetupStep>
          </ol>
          <div className="flex justify-end">{turnOff}</div>
        </div>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection index={4} title="Card payments" blurb={HOOK_BLURB}>
      <div className={LIST}>
        <SettingsRow
          stacked
          title={problem ? "Needs attention" : "On"}
          description={
            problem
              ? undefined
              : lastEventAt
                ? `Working. Last message from Stripe: ${dateFmt.format(new Date(lastEventAt))}.`
                : "Waiting for the first message from Stripe. It arrives with the next card payment."
          }
        >
          <div className="flex flex-col gap-3">
            {problem && (
              <Callout tone="warning" title={problem.title}>
                <p>{problem.fix}</p>
              </Callout>
            )}
            <CopyValue value={url} label="Copy URL" />
            {owner && (
              <p className="text-muted-foreground text-sm">
                Changed the endpoint in Stripe? Paste its new signing secret.
              </p>
            )}
            {secretForm}
            <div className="flex justify-end">{turnOff}</div>
          </div>
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
      <SettingsSection index={5} title="Memberships" blurb={MEMBERSHIP_BLURB}>
        <SkeletonRows rows={3} lines={2} inList />
      </SettingsSection>
    );
  if (policy.isError) {
    return (
      <SettingsSection index={5} title="Memberships" blurb={MEMBERSHIP_BLURB}>
        <ErrorState
          label="your membership settings"
          onRetry={() => void policy.refetch()}
        />
      </SettingsSection>
    );
  }

  const saved = policy.data;
  return (
    <SettingsSection index={5} title="Memberships" blurb={MEMBERSHIP_BLURB}>
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
