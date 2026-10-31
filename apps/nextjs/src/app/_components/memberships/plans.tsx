"use client";

import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Ellipsis, Plus, Users } from "lucide-react";

import type { RouterOutputs } from "@matops/api";
import { formatMoney, formatMonth, nextMonth } from "@matops/domain";
import { cn } from "@matops/ui";
import { Badge } from "@matops/ui/badge";
import { Button } from "@matops/ui/button";
import { Callout } from "@matops/ui/callout";
import { Dialog, DialogContent, DialogTitle } from "@matops/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@matops/ui/dropdown-menu";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { FOCUS_RING } from "@matops/ui/motion";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";
import {
  CreateAccessPlanSchema,
  SetAccessPlanPriceSchema,
  SetPlanPaymentLinkSchema,
} from "@matops/validators";

import { useTRPC } from "~/trpc/react";
import { useOrganization } from "../entity";
import { METHOD_ICONS } from "../payment-method-icons";
import { ENTER, LIST, stagger, Switch } from "../primitives";
import { SkeletonRows } from "../skeletons";
import { EmptyState, ErrorState } from "../states";

type Plan = RouterOutputs["accessPlan"]["list"][number];

export function PlansTab({
  onNewPlan,
  onOpenSetup,
}: {
  onNewPlan: () => void;
  onOpenSetup: () => void;
}) {
  const trpc = useTRPC();
  const plans = useQuery(trpc.accessPlan.list.queryOptions());
  const methods = useQuery(trpc.paymentMethod.list.queryOptions());
  const enabled = methods.data?.filter((m) => m.enabled) ?? [];

  return (
    <section
      aria-labelledby="plans-heading"
      className="flex min-w-0 flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id="plans-heading" className="text-md font-semibold">
          What you sell
        </h2>
        <p className="text-muted-foreground text-sm text-pretty">
          For each plan, choose whether students can pick it and which ways to
          pay it takes.
        </p>
      </div>
      {methods.isSuccess && (
        <WaysToPaySummary
          plans={plans.data ?? []}
          methods={enabled}
          onOpenSetup={onOpenSetup}
        />
      )}
      {plans.isPending ? (
        <SkeletonRows rows={3} inList />
      ) : plans.isError ? (
        <ErrorState label="your plans" onRetry={() => void plans.refetch()} />
      ) : plans.data.length === 0 ? (
        <EmptyState
          title="No membership plans yet."
          action={<Button onClick={onNewPlan}>New plan</Button>}
        >
          Make one for each thing you sell: BJJ only, BJJ and gym, gym and
          sauna.
        </EmptyState>
      ) : (
        <ul className={LIST}>
          {plans.data.map((p, i) => (
            <li key={p.id} style={stagger(i)} className={ENTER}>
              <PlanCard plan={p} methods={enabled} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WaysToPaySummary({
  plans,
  methods,
  onOpenSetup,
}: {
  plans: Plan[];
  methods: Method[];
  onOpenSetup: () => void;
}) {
  const linked = plans.some(
    (p) => !p.archived && p.priceMinor !== null && p.paymentLinkUrl,
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-muted-foreground text-sm">Ways to pay:</span>
        {methods.length === 0 ? (
          <span className="text-muted-foreground text-sm">none on yet</span>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {methods.map((m) => (
              <li key={m.id}>
                <MethodChip
                  icon={METHOD_ICONS[m.kind]}
                  label={m.label}
                  on
                  hint={m.label}
                />
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={onOpenSetup}
          className={cn(
            "text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-1 rounded-sm text-sm sm:min-h-8",
            FOCUS_RING,
          )}
        >
          Add or change in Setup
          <ArrowRight className="size-3.5" aria-hidden />
        </button>
      </div>
      {methods.length === 0 && !linked && (
        <Callout tone="warning" title="Students can't pay yet">
          Turn on a way to pay in Setup, or add a card link to a plan. Until
          then no plan shows to students.
        </Callout>
      )}
    </div>
  );
}

type Method = RouterOutputs["paymentMethod"]["list"][number];

function PlanCard({ plan, methods }: { plan: Plan; methods: Method[] }) {
  const owner = useOrganization().role === "owner";
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries(trpc.accessPlan.list.pathFilter());
  const staffOnly = useMutation(
    trpc.accessPlan.setStaffOnly.mutationOptions({
      onSuccess: invalidate,
      onError: (e) => toast.error(e.message),
    }),
  );
  const planMethod = useMutation(
    trpc.accessPlan.setPlanMethod.mutationOptions({
      onSettled: invalidate,
      onError: (e) => toast.error(e.message || "Couldn't save that."),
    }),
  );
  const archive = useMutation(
    trpc.accessPlan.archive.mutationOptions({
      onSuccess: invalidate,
      onError: (e) => toast.error(e.message),
    }),
  );
  const [pricing, setPricing] = useState(false);
  const [linking, setLinking] = useState(false);
  const priced = plan.priceMinor !== null && plan.currency;
  const switchId = `plan-open-${plan.id}`;
  const methodsOn = methods.filter((m) => !plan.methodsOff.includes(m.id));
  const noWayToPay =
    !plan.archived &&
    priced &&
    !plan.staffOnly &&
    !plan.paymentLinkUrl &&
    methodsOn.length === 0;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 px-4 py-4",
        plan.archived && "opacity-60",
      )}
    >
      <PriceDialog
        plan={plan}
        owner={owner}
        open={pricing}
        onOpenChange={setPricing}
      />
      {linking && <PaymentLinkDialog plan={plan} onOpenChange={setLinking} />}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-md font-semibold">{plan.name}</h3>
            {priced ? (
              <span className="text-md tabular-nums">
                {formatMoney(plan.priceMinor ?? 0, plan.currency ?? "EUR")}
                <span className="text-muted-foreground text-sm"> a month</span>
              </span>
            ) : (
              <span className="text-warning text-sm">No price yet</span>
            )}
            {plan.archived && <Badge>Archived</Badge>}
          </div>
          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm tabular-nums">
            <Users className="size-3.5" aria-hidden />
            {plan.activeHolders === 1
              ? "1 member"
              : `${plan.activeHolders} members`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!plan.archived && plan.gaps.missing > 0 && (
            <Reconcile planId={plan.id} missing={plan.gaps.missing} />
          )}
          {!plan.archived && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPricing(true)}
            >
              {priced ? "Change price" : "Set price"}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                busy={archive.isPending}
                disabled={archive.isPending}
                aria-label={`More for ${plan.name}`}
              >
                <Ellipsis aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {owner && !plan.archived && priced && (
                <DropdownMenuItem onSelect={() => setLinking(true)}>
                  {plan.paymentLinkUrl
                    ? "Change card payment link"
                    : "Add card payment link"}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() =>
                  archive.mutate({ id: plan.id, archived: !plan.archived })
                }
              >
                {plan.archived ? "Restore plan" : "Archive plan"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {!plan.archived && (
        <dl className="grid gap-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
          <dt className="text-muted-foreground">Students</dt>
          <dd className="flex items-center gap-2">
            <Switch
              id={switchId}
              checked={!plan.staffOnly}
              disabled={staffOnly.isPending || !priced}
              onCheckedChange={(open) =>
                staffOnly.mutate({ planId: plan.id, staffOnly: !open })
              }
            />
            <label htmlFor={switchId} className="cursor-pointer">
              {!priced
                ? "Add a price so students can choose it"
                : plan.staffOnly
                  ? "Hidden. Staff assign it from a student's profile"
                  : "Students can choose this plan"}
            </label>
          </dd>

          {priced && (
            <>
              <dt className="text-muted-foreground">Ways to pay</dt>
              <dd className="flex flex-wrap gap-2">
                <MethodChip
                  icon={METHOD_ICONS.card}
                  label="Card"
                  on={Boolean(plan.paymentLinkUrl)}
                  hint={
                    plan.paymentLinkUrl
                      ? "Change card payment link"
                      : "Add a Stripe link to take cards"
                  }
                  onClick={owner ? () => setLinking(true) : undefined}
                />
                {methods.map((m) => {
                  const on = !plan.methodsOff.includes(m.id);
                  return (
                    <MethodChip
                      key={m.id}
                      icon={METHOD_ICONS[m.kind]}
                      label={m.label}
                      on={on}
                      pressed={on}
                      busy={
                        planMethod.isPending &&
                        planMethod.variables.methodId === m.id
                      }
                      hint={
                        on
                          ? `Stop taking ${m.label} for ${plan.name}`
                          : `Take ${m.label} for ${plan.name}`
                      }
                      onClick={
                        owner
                          ? () =>
                              planMethod.mutate({
                                planId: plan.id,
                                methodId: m.id,
                                on: !on,
                              })
                          : undefined
                      }
                    />
                  );
                })}
              </dd>
            </>
          )}
        </dl>
      )}

      {noWayToPay && (
        <p className="text-warning text-sm">
          Students can&apos;t choose this plan until it has a way to pay.
        </p>
      )}
    </div>
  );
}

function MethodChip({
  icon: Icon,
  label,
  on,
  pressed,
  busy,
  hint,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  on: boolean;
  pressed?: boolean;
  busy?: boolean;
  hint: string;
  onClick?: () => void;
}) {
  const look = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors motion-reduce:transition-none",
    on
      ? "border-border-strong bg-surface-2 text-foreground"
      : "border-border text-muted-foreground border-dashed",
  );
  const body = (
    <>
      <Icon className="size-3.5" aria-hidden />
      <span className={cn(!on && "line-through")}>{label}</span>
      {on ? (
        <Check className="text-success size-3.5" aria-hidden />
      ) : (
        <Plus className="size-3.5" aria-hidden />
      )}
    </>
  );
  if (!onClick) {
    return (
      <span className={look}>
        {body}
        <span className="sr-only">{on ? "(on)" : "(off)"}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      title={hint}
      aria-label={pressed === undefined ? hint : label}
      aria-pressed={pressed}
      disabled={busy}
      onClick={onClick}
      className={cn(
        look,
        FOCUS_RING,
        "hover:bg-hover min-h-11 disabled:opacity-60 sm:min-h-8",
      )}
    >
      {body}
    </button>
  );
}

/**
 * Price a plan that has one, or one made with "price it later" (ADR 127).
 *
 * A change starts from a month nobody has been billed for, so the default is
 * next month and the server refuses anything earlier. The one exception is a
 * plan that has never had a price: its first one may start this month, because
 * no member has been asked for an amount on it yet.
 */
function PriceDialog({
  plan,
  owner,
  open,
  onOpenChange,
}: {
  plan: Plan;
  owner: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const board = useQuery(trpc.accessPlan.monthBoard.queryOptions());
  const unpriced = plan.priceMinor === null;
  const earliest = board.data
    ? unpriced
      ? board.data.month
      : nextMonth(board.data.month)
    : null;

  const [amount, setAmount] = useState(
    plan.priceMinor === null ? "" : (plan.priceMinor / 100).toFixed(2),
  );
  const [currency, setCurrency] = useState(plan.currency ?? "EUR");
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation(
    trpc.accessPlan.setPrice.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.accessPlan.list.pathFilter());
        setError(null);
        onOpenChange(false);
        toast.success("Price saved");
      },
      onError: (e) =>
        toast.error(e.message || "Couldn't save that price. Try again."),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{plan.name}</DialogTitle>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!earliest) return;
            const parsed = SetAccessPlanPriceSchema.safeParse({
              id: plan.id,
              priceMinor: Math.round(parseFloat(amount.trim()) * 100),
              currency,
              effectiveMonth: earliest,
              paymentLinkUrl: link.trim() === "" ? undefined : link,
            });
            if (!parsed.success) {
              setError(
                parsed.error.issues.some((i) => i.path[0] === "paymentLinkUrl")
                  ? "Paste a Stripe payment link that starts with https://buy.stripe.com/"
                  : "Give the price as a number, like 45 or 45.50.",
              );
              return;
            }
            setError(null);
            save.mutate(parsed.data);
          }}
        >
          <p className="text-muted-foreground text-sm">
            {earliest
              ? `Applies from ${formatMonth(earliest, board.data?.timeZone ?? "UTC")}. Earlier months keep the amount members were already asked for.`
              : "Reading your gym's calendar…"}
          </p>
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor={`price-${plan.id}`}>A month</Label>
              <Input
                id={`price-${plan.id}`}
                inputMode="decimal"
                value={amount}
                placeholder="45"
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="flex w-28 flex-col gap-2">
              <Label htmlFor={`currency-${plan.id}`}>Currency</Label>
              <Input
                id={`currency-${plan.id}`}
                maxLength={3}
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              />
            </div>
          </div>
          {owner && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`price-link-${plan.id}`}>
                Stripe payment link for this price (optional)
              </Label>
              {plan.paymentLinkUrl && (
                <p className="text-muted-foreground text-sm">
                  This plan's payment link charges the current price. Add a new
                  link with the new amount, or Pay by card disappears when the
                  new price starts.
                </p>
              )}
              <Input
                id={`price-link-${plan.id}`}
                type="url"
                value={link}
                placeholder="https://buy.stripe.com/…"
                onChange={(e) => setLink(e.target.value)}
              />
            </div>
          )}
          {error && <FieldError>{error}</FieldError>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              busy={save.isPending}
              disabled={save.isPending || !earliest}
            >
              Save price
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The gym's own Stripe Payment Link for the price members pay this month
 * (ADR 156). Payments land in the gym's Stripe account, and staff still confirm
 * the month with Mark paid.
 */
function PaymentLinkDialog({
  plan,
  onOpenChange,
}: {
  plan: Plan;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [link, setLink] = useState(plan.paymentLinkUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = useMutation(
    trpc.accessPlan.setPaymentLink.mutationOptions({
      onSuccess: async (_, input) => {
        await queryClient.invalidateQueries(trpc.accessPlan.pathFilter());
        onOpenChange(false);
        toast.success(
          input.paymentLinkUrl ? "Payment link saved" : "Payment link removed",
        );
      },
      onError: (e) =>
        toast.error(e.message || "Couldn't save that link. Try again."),
    }),
  );
  const submit = (value: string | null) => {
    const parsed = SetPlanPaymentLinkSchema.safeParse({
      planId: plan.id,
      paymentLinkUrl: value,
    });
    if (!parsed.success) {
      setError(
        "Paste a Stripe payment link that starts with https://buy.stripe.com/",
      );
      return;
    }
    setError(null);
    save.mutate(parsed.data);
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Payment link for {plan.name}</DialogTitle>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(link.trim() === "" ? null : link);
          }}
        >
          <ol className="text-muted-foreground flex list-decimal flex-col gap-1 pl-5 text-sm">
            <li>
              In Stripe, create a Payment Link with a one-time price of{" "}
              <strong className="text-foreground">
                {plan.currentAmount
                  ? formatMoney(
                      plan.currentAmount.priceMinor,
                      plan.currentAmount.currency,
                    )
                  : "this month's price"}
              </strong>
              . The amount must match exactly, or payments wait for you to check
              them.
            </li>
            <li>Copy the link Stripe gives you and paste it below.</li>
          </ol>
          <Button size="sm" variant="outline" className="self-start" asChild>
            <a
              href="https://dashboard.stripe.com/payment-links/create"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Stripe Payment Links
            </a>
          </Button>
          <p className="text-muted-foreground text-sm">
            Students then see Pay by card for this month, and the money goes to
            your Stripe account. With card payments set up in Setup, a paid
            month is marked paid on its own; otherwise confirm it with Mark
            paid.
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`link-${plan.id}`}>Stripe payment link</Label>
            <Input
              id={`link-${plan.id}`}
              type="url"
              value={link}
              placeholder="https://buy.stripe.com/…"
              onChange={(e) => setLink(e.target.value)}
            />
          </div>
          {error && <FieldError>{error}</FieldError>}
          <div className="flex flex-wrap justify-end gap-2">
            {plan.paymentLinkUrl && (
              <Button
                type="button"
                variant="outline"
                disabled={save.isPending}
                onClick={() => submit(null)}
              >
                Remove link
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              busy={save.isPending}
              disabled={save.isPending}
            >
              Save link
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewPlanDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { entities } = useOrganization();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation(
    trpc.accessPlan.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.accessPlan.list.pathFilter());
        setName("");
        setDescription("");
        setPrice("");
        setError(null);
        onOpenChange(false);
      },
      onError: (e) =>
        toast.error(e.message || "Couldn't add that plan. Try again."),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>New membership plan</DialogTitle>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            // A blank price is "not priced yet", not zero: the two fields go
            // together or not at all, which is what the schema and the column
            // both say (ADR 128).
            const typed = price.trim();
            const parsed = CreateAccessPlanSchema.safeParse({
              name,
              description,
              entityIds: entities.map((e) => e.id),
              priceMinor:
                typed === "" ? undefined : Math.round(parseFloat(typed) * 100),
              currency: typed === "" ? undefined : currency,
            });
            if (!parsed.success) {
              setError(
                typed === ""
                  ? "Give the plan a name of 1-80 characters."
                  : "Check the name, and give the price as a number.",
              );
              return;
            }
            setError(null);
            create.mutate(parsed.data);
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="plan-name">Name</Label>
            <Input
              id="plan-name"
              value={name}
              autoFocus
              placeholder="BJJ + Gym"
              aria-invalid={error ? true : undefined}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
            {error && <FieldError id="plan-name-error">{error}</FieldError>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="plan-description">Description</Label>
            <Textarea
              id="plan-description"
              rows={2}
              maxLength={500}
              value={description}
              placeholder="What it covers, in your own words. Optional."
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="plan-price">Price a month</Label>
              <Input
                id="plan-price"
                value={price}
                inputMode="decimal"
                placeholder="Leave empty to price it later"
                onChange={(e) => {
                  setPrice(e.target.value);
                  setError(null);
                }}
              />
            </div>
            <div className="flex w-28 flex-col gap-2">
              <Label htmlFor="plan-currency">Currency</Label>
              <Input
                id="plan-currency"
                value={currency}
                maxLength={3}
                onChange={(e) => {
                  setCurrency(e.target.value.toUpperCase());
                  setError(null);
                }}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              busy={create.isPending}
              disabled={create.isPending}
            >
              Add plan
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Finish coverage work a save could not (spec FP8, ADR 129).
 *
 * Adding a branch to a plan now enrols its holders in the same call, so this is
 * a retry rather than a step. It appears only while `gaps.missing` says
 * somebody on the plan still has no membership at a branch it covers.
 *
 * Safe to press again: the run reads the state each time and writes only what
 * is absent, so a second press does nothing and a press after a failure
 * finishes the job.
 */
function Reconcile({ planId, missing }: { planId: string; missing: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const run = useMutation(
    trpc.accessPlan.reconcile.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries();
        if (result.failed.length > 0) {
          toast.error(
            `Couldn't update ${result.failed
              .map((f) => f.name)
              .join(", ")}. Try again.`,
          );
          return;
        }
        toast.success(
          result.enrolled.length === 1
            ? "1 person enrolled at a branch they were missing"
            : `${result.enrolled.length} people enrolled at branches they were missing`,
        );
      },
      onError: (e) =>
        toast.error(e.message || "Couldn't finish it. Try again."),
    }),
  );

  return (
    <Button
      size="sm"
      variant="outline"
      busy={run.isPending}
      onClick={() => run.mutate({ id: planId })}
    >
      {missing === 1 ? "Finish 1 enrolment" : `Finish ${missing} enrolments`}
    </Button>
  );
}
