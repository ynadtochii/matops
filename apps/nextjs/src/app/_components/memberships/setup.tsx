"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";

import type { RouterOutputs } from "@matops/api";
import type { PaymentMethodKind } from "@matops/domain";
import {
  isOwner,
  MAX_PAYMENT_METHODS,
  PAYMENT_METHOD_DEFAULT_LABEL,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Badge } from "@matops/ui/badge";
import { Button } from "@matops/ui/button";
import { Callout } from "@matops/ui/callout";
import { Checkbox } from "@matops/ui/checkbox";
import { CopyButton } from "@matops/ui/copy-button";
import { Dialog, DialogContent, DialogTitle } from "@matops/ui/dialog";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Select } from "@matops/ui/select";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";
import {
  MembershipPolicySchema,
  SavePaymentMethodSchema,
  SaveStripeHookSecretSchema,
} from "@matops/validators";

import type { Organization } from "../entity";
import { dateFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useOrganization } from "../entity";
import {
  ENTER,
  LIST,
  SectionHeading,
  SettingsRow,
  stagger,
} from "../primitives";
import { SkeletonRows } from "../skeletons";
import { ErrorState } from "../states";

/**
 * One settings section. The heading and its blurb stay put while the query
 * behind the section loads, so nothing below them jumps when it lands, and
 * `index` places the section in the page's entrance.
 */
function SettingsSection({
  id,
  index,
  title,
  blurb,
  children,
}: {
  id?: string;
  index: number;
  title: string;
  blurb?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      style={stagger(index)}
      className={cn(ENTER, "flex scroll-mt-20 flex-col gap-3")}
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
  "Set up plans and ways to pay first. Students see them only after you turn payments on.";

function uncoveredLine(names: string[]) {
  if (names.length === 0) return "Every active student has a plan.";
  const shown = names.slice(0, 5).join(", ");
  const rest = names.length - Math.min(names.length, 5);
  const who = names.length === 1 ? "student has" : "students have";
  return `${names.length} ${who} no plan yet. They will be asked to choose one before booking: ${shown}${rest > 0 ? ` and ${rest} more` : ""}.`;
}

export function SetupTab() {
  return (
    <div className="flex max-w-3xl min-w-0 flex-col gap-10">
      <MembershipPaymentsSwitch />
      <PaymentMethodSettings />
      <CardPaymentHookSection />
      <GraceDaysSection />
    </div>
  );
}

/** The owner's switch for `entity.membership_enforced_at` (ADR 154). */
function MembershipPaymentsSwitch() {
  const { entities } = useOrganization();
  const trpc = useTRPC();
  const anyOff = entities.some((e) => !e.membershipEnforced);
  const uncovered = useQuery({
    ...trpc.accessPlan.uncovered.queryOptions(),
    enabled: anyOff,
  });

  return (
    <SettingsSection index={0} title="Membership payments" blurb={SWITCH_BLURB}>
      <div className={LIST}>
        {entities.map((e) => (
          <AcademyPaymentsRow
            key={e.id}
            academy={e}
            named={entities.length > 1}
            uncovered={uncovered}
          />
        ))}
      </div>
    </SettingsSection>
  );
}

function AcademyPaymentsRow({
  academy,
  named,
  uncovered,
}: {
  academy: Organization["entities"][number];
  named: boolean;
  uncovered: {
    isPending: boolean;
    isError: boolean;
    data?: RouterOutputs["accessPlan"]["uncovered"];
  };
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const on = academy.membershipEnforced;
  const flip = useMutation(
    trpc.academy.setMembershipEnforced.mutationOptions({
      trpc: { context: { entityId: academy.id } },
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
      .find((g) => g.entityId === academy.id)
      ?.people.map((p) => p.name) ?? [];
  const state = on ? "On" : "Off";

  return (
    <SettingsRow
      title={named ? `${academy.name}: ${state}` : state}
      description={
        on
          ? "Students need a plan and a paid month to book."
          : "Approved students book without a plan or payment."
      }
    >
      {!isOwner(academy) ? null : on ? (
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
  );
}

const GRACE_BLURB =
  "How long a student can keep booking after a renewal month starts unpaid. A plan a student just chose has no extra days.";

function GraceDaysSection() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const policy = useQuery(trpc.accessPlan.policy.queryOptions());

  return (
    <SettingsSection index={3} title="Days to pay" blurb={GRACE_BLURB}>
      {policy.isPending ? (
        <SkeletonRows rows={1} inList />
      ) : policy.isError ? (
        <ErrorState
          label="your payment days"
          onRetry={() => void policy.refetch()}
        />
      ) : (
        <GraceDaysForm
          key={policy.data.graceDays}
          graceDays={policy.data.graceDays}
          timeZone={policy.data.effective}
          onSave={() =>
            queryClient.invalidateQueries(trpc.accessPlan.pathFilter())
          }
          calendarTimeZone={policy.data.calendarTimeZone}
        />
      )}
    </SettingsSection>
  );
}

function GraceDaysForm({
  graceDays,
  calendarTimeZone,
  timeZone,
  onSave,
}: {
  graceDays: number;
  calendarTimeZone: string | null;
  timeZone: string;
  onSave: () => Promise<void>;
}) {
  const trpc = useTRPC();
  const [value, setValue] = useState(String(graceDays));
  const [error, setError] = useState<string | null>(null);
  const save = useMutation(
    trpc.accessPlan.setPolicy.mutationOptions({
      onSuccess: async () => {
        await onSave();
        toast.success("Saved");
      },
      onError: (e) => toast.error(e.message || "Couldn't save that."),
    }),
  );

  return (
    <form
      className={cn(LIST, "flex flex-wrap items-end gap-3 p-4")}
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = MembershipPolicySchema.safeParse({
          graceDays: Number(value),
          calendarTimeZone,
        });
        if (!parsed.success || value.trim() === "") {
          setError("Give a whole number of days from 0 to 28.");
          return;
        }
        setError(null);
        save.mutate(parsed.data);
      }}
    >
      <div className="flex w-32 flex-col gap-2">
        <Label htmlFor="grace-days">Days</Label>
        <Input
          id="grace-days"
          inputMode="numeric"
          value={value}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
        />
      </div>
      <Button
        type="submit"
        size="sm"
        busy={save.isPending}
        disabled={save.isPending || value === String(graceDays)}
      >
        Save
      </Button>
      <p className="text-muted-foreground w-full text-sm">
        Months start on the 1st, in {timeZone} time.
      </p>
      {error && <FieldError className="w-full">{error}</FieldError>}
    </form>
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

function CardPaymentHookSection() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const owner = useOrganization().role === "owner";
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
      <SettingsSection index={2} title="Card payments" blurb={HOOK_BLURB}>
        <SkeletonRows rows={1} lines={2} inList />
      </SettingsSection>
    );
  }
  if (hook.isError) {
    return (
      <SettingsSection index={2} title="Card payments" blurb={HOOK_BLURB}>
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
      <SettingsSection index={2} title="Card payments" blurb={HOOK_BLURB}>
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
      <SettingsSection index={2} title="Card payments" blurb={HOOK_BLURB}>
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
    <SettingsSection index={2} title="Card payments" blurb={HOOK_BLURB}>
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

type PaymentMethodRow = RouterOutputs["paymentMethod"]["list"][number];

const WAYS_TO_PAY_BLURB =
  "Students see these when they pay for a membership. Card payments come from the Stripe links on your plans.";

const DETAILS_FIELD: Record<
  PaymentMethodKind,
  { label: string; placeholder: string }
> = {
  bank: {
    label: "Account details",
    placeholder: "IBAN: PT50 …\nAccount holder: …",
  },
  mbway: { label: "MB WAY phone number", placeholder: "+351 9…" },
  cash: {
    label: "Note for students (optional)",
    placeholder: "Pay at the front desk before class.",
  },
  other: {
    label: "How to pay",
    placeholder: "What students send, where, and to whom.",
  },
};

function PaymentMethodSettings() {
  const owner = useOrganization().role === "owner";
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const methods = useQuery(trpc.paymentMethod.list.queryOptions());
  const [editing, setEditing] = useState<PaymentMethodRow | "new" | null>(null);
  const reorder = useMutation(
    trpc.paymentMethod.reorder.mutationOptions({
      onSettled: () =>
        queryClient.invalidateQueries(trpc.paymentMethod.pathFilter()),
      onError: (e) =>
        toast.error(e.message || "Couldn't move that. Try again."),
    }),
  );

  if (methods.isPending)
    return (
      <SettingsSection
        id="ways-to-pay"
        index={1}
        title="Ways to pay"
        blurb={WAYS_TO_PAY_BLURB}
      >
        <SkeletonRows rows={2} lines={2} inList />
      </SettingsSection>
    );
  if (methods.isError) {
    return (
      <SettingsSection
        id="ways-to-pay"
        index={1}
        title="Ways to pay"
        blurb={WAYS_TO_PAY_BLURB}
      >
        <ErrorState
          label="your ways to pay"
          onRetry={() => void methods.refetch()}
        />
      </SettingsSection>
    );
  }

  const list = methods.data;
  const move = (from: number, to: number) => {
    const ids = list.map((m) => m.id);
    const [id] = ids.splice(from, 1);
    if (!id) return;
    ids.splice(to, 0, id);
    reorder.mutate({ ids });
  };

  return (
    <SettingsSection
      id="ways-to-pay"
      index={1}
      title="Ways to pay"
      blurb={WAYS_TO_PAY_BLURB}
    >
      <div className={LIST}>
        {list.length === 0 && (
          <SettingsRow description="No ways to pay yet. Add a bank transfer, MB WAY, cash, or your own." />
        )}
        {list.map((m, i) => (
          <SettingsRow
            key={m.id}
            title={
              <span className="flex items-center gap-2">
                {m.label}
                {!m.enabled && <Badge>Hidden</Badge>}
              </span>
            }
            description={
              m.details ? (
                <span className="line-clamp-2 whitespace-pre-wrap">
                  {m.details}
                </span>
              ) : undefined
            }
          >
            {owner && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Move ${m.label} up`}
                  disabled={i === 0 || reorder.isPending}
                  onClick={() => move(i, i - 1)}
                >
                  <ChevronUp aria-hidden />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Move ${m.label} down`}
                  disabled={i === list.length - 1 || reorder.isPending}
                  onClick={() => move(i, i + 1)}
                >
                  <ChevronDown aria-hidden />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(m)}
                >
                  Edit
                </Button>
              </>
            )}
          </SettingsRow>
        ))}
        {owner ? (
          <div className="flex justify-end p-4">
            <Button
              size="sm"
              disabled={list.length >= MAX_PAYMENT_METHODS}
              onClick={() => setEditing("new")}
            >
              Add a way to pay
            </Button>
          </div>
        ) : (
          <SettingsRow description="Only the owner can change how students pay." />
        )}
      </div>
      {editing && (
        <PaymentMethodDialog
          method={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </SettingsSection>
  );
}

function PaymentMethodDialog({
  method,
  onClose,
}: {
  method: PaymentMethodRow | null;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<PaymentMethodKind>(method?.kind ?? "bank");
  const [label, setLabel] = useState(
    method?.label ?? PAYMENT_METHOD_DEFAULT_LABEL.bank,
  );
  const [details, setDetails] = useState(method?.details ?? "");
  const [enabled, setEnabled] = useState(method?.enabled ?? true);
  const [error, setError] = useState<string | null>(null);

  const done = async (message: string) => {
    await queryClient.invalidateQueries(trpc.paymentMethod.pathFilter());
    await queryClient.invalidateQueries(trpc.organization.setup.pathFilter());
    toast.success(message);
    onClose();
  };
  const save = useMutation(
    trpc.paymentMethod.save.mutationOptions({
      onSuccess: () => done("Saved"),
      onError: (e) =>
        toast.error(e.message || "Couldn't save that. Try again."),
    }),
  );
  const remove = useMutation(
    trpc.paymentMethod.remove.mutationOptions({
      onSuccess: () => done("Removed"),
      onError: (e) =>
        toast.error(e.message || "Couldn't remove that. Try again."),
    }),
  );
  const field = DETAILS_FIELD[kind];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>
          {method ? `Edit ${method.label}` : "Add a way to pay"}
        </DialogTitle>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const parsed = SavePaymentMethodSchema.safeParse({
              id: method?.id,
              kind,
              label,
              details,
              enabled,
            });
            if (!parsed.success) {
              setError(
                parsed.error.issues[0]?.path[0] === "label"
                  ? "Add the name students see."
                  : "Add the details students need to pay.",
              );
              return;
            }
            setError(null);
            save.mutate(parsed.data);
          }}
        >
          {!method && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="method-kind">Type</Label>
              <Select
                id="method-kind"
                value={kind}
                onChange={(e) => {
                  const next = e.target.value as PaymentMethodKind;
                  if (label === PAYMENT_METHOD_DEFAULT_LABEL[kind]) {
                    setLabel(PAYMENT_METHOD_DEFAULT_LABEL[next]);
                  }
                  setKind(next);
                }}
              >
                <option value="bank">Bank transfer</option>
                <option value="mbway">MB WAY</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="method-label">Name students see</Label>
            <Input
              id="method-label"
              value={label}
              maxLength={60}
              placeholder="Revolut, PayPal, …"
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="method-details">{field.label}</Label>
            <Textarea
              id="method-details"
              value={details}
              rows={kind === "mbway" ? 1 : 3}
              maxLength={1000}
              placeholder={field.placeholder}
              onChange={(e) => setDetails(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={enabled}
              onCheckedChange={(checked) => setEnabled(checked === true)}
            />
            Show to students
          </label>
          {error && <FieldError>{error}</FieldError>}
          <div className="flex flex-wrap justify-end gap-2">
            {method && (
              <ConfirmDialog
                title={`Remove ${method.label}?`}
                description="Students stop seeing it. Payments already made are not affected."
                confirmLabel="Remove"
                onConfirm={async () => {
                  await remove.mutateAsync({ id: method.id });
                }}
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    className="sm:mr-auto"
                    disabled={save.isPending}
                  >
                    Remove
                  </Button>
                }
              />
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              busy={save.isPending}
              disabled={save.isPending}
            >
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
