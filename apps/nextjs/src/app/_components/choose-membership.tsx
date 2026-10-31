"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ExternalLink,
  FileCheck,
  Upload,
} from "lucide-react";

import type { RouterOutputs } from "@matops/api";
import type { PaymentMethodKind } from "@matops/domain";
import {
  cashPaidOnEarliest,
  FILE_RULES,
  formatMoney,
  formatMonth,
  localDateISO,
  paymentMethodUsesReference,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@matops/ui/collapsible";
import { CopyButton } from "@matops/ui/copy-button";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { FOCUS_RING } from "@matops/ui/motion";
import { Select } from "@matops/ui/select";
import { Spinner } from "@matops/ui/spinner";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { useEntity } from "./entity";
import { useReceiptUpload } from "./file-upload";
import { CARD, METHOD_ICONS } from "./payment-method-icons";
import { cardClass, Eyebrow } from "./primitives";
import { SkeletonCard } from "./skeletons";
import { EmptyState, ErrorState } from "./states";

type Mine = RouterOutputs["accessPlan"]["mine"];
type Membership = Mine["memberships"][number];
type Options = RouterOutputs["studentPlan"]["options"];
type Method = Options["methods"][number];

const SOMEONE_ELSE = "__someone_else__";

export function ChooseMembership({ mine }: { mine: Mine }) {
  const trpc = useTRPC();
  const options = useQuery(trpc.studentPlan.options.queryOptions());
  const [picking, setPicking] = useState(false);
  const banner = mine.banner;

  if (banner?.kind === "no_plans") {
    return (
      <EmptyState title="Your gym has not set up memberships yet.">
        Booking opens once you are on a plan. Ask your gym.
      </EmptyState>
    );
  }
  if (options.isPending) return <SkeletonCard lines={4} />;
  if (options.isError) {
    return (
      <ErrorState
        label="the membership plans"
        onRetry={() => void options.refetch()}
      />
    );
  }

  const payingFor =
    banner?.kind === "finish_payment" ||
    banner?.kind === "renew_due" ||
    banner?.kind === "renew_overdue"
      ? mine.memberships.find((m) => m.assignmentId === banner.assignmentId)
      : undefined;
  const renewal =
    banner?.kind === "renew_due" || banner?.kind === "renew_overdue";
  const chosen = renewal ? undefined : payingFor;

  if (renewal && payingFor) {
    return <PayStep membership={payingFor} options={options.data} />;
  }

  if (!chosen || picking) {
    return (
      <PlanPicker
        plans={options.data.plans}
        current={chosen?.planName ?? null}
        onCancel={chosen ? () => setPicking(false) : undefined}
        onChosen={() => setPicking(false)}
      />
    );
  }
  return (
    <PayStep
      membership={chosen}
      options={options.data}
      onChangePlan={() => setPicking(true)}
    />
  );
}

function Progress({ current }: { current: 1 | 2 }) {
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="Progress">
      {["Choose a plan", "Pay"].map((label, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <li
            key={label}
            className="flex items-center gap-2"
            aria-current={active ? "step" : undefined}
          >
            {i > 0 && <span aria-hidden className="bg-border h-px w-6" />}
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full border text-xs font-medium tabular-nums",
                done && "border-success/30 bg-success/10 text-success",
                active && "border-primary bg-primary text-primary-foreground",
                !done && !active && "border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden /> : step}
            </span>
            <span
              className={
                active ? "text-foreground font-medium" : "text-muted-foreground"
              }
            >
              {label}
              {done && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function PlanPicker({
  plans,
  current,
  onCancel,
  onChosen,
}: {
  plans: Options["plans"];
  current: string | null;
  onCancel?: () => void;
  onChosen: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const choose = useMutation(
    trpc.studentPlan.choose.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.accessPlan.pathFilter());
        onChosen();
      },
      onError: (e) =>
        toast.error(e.message || "Couldn't choose that plan. Try again."),
    }),
  );

  return (
    <section className="flex flex-col gap-5" aria-label="Choose a plan">
      <Progress current={1} />
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Choose a membership</h2>
        <p className="text-muted-foreground text-sm">
          You pay for it in the next step.
        </p>
      </div>
      {plans.length === 0 ? (
        <EmptyState title="No plans are open right now.">
          Ask your gym which plan to take.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {plans.map((plan) => (
            <li
              key={plan.id}
              className={cn(cardClass(), "flex flex-col gap-3")}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-md font-semibold">{plan.name}</h3>
                {plan.amount && (
                  <p className="text-lg font-medium whitespace-nowrap tabular-nums">
                    {formatMoney(plan.amount.priceMinor, plan.amount.currency)}
                    <span className="text-muted-foreground text-sm font-normal">
                      {" "}
                      a month
                    </span>
                  </p>
                )}
              </div>
              {plan.description && (
                <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                  {plan.description}
                </p>
              )}
              <Button
                className="mt-auto self-start max-sm:w-full"
                variant={plan.name === current ? "outline" : "primary"}
                busy={choose.isPending && choose.variables.planId === plan.id}
                disabled={choose.isPending}
                onClick={() => choose.mutate({ planId: plan.id })}
              >
                {plan.name === current ? "Keep this plan" : "Choose"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {onCancel && (
        <Button variant="ghost" className="self-start" onClick={onCancel}>
          Back to payment
        </Button>
      )}
    </section>
  );
}

function methodHint(kind: PaymentMethodKind | typeof CARD, proof: boolean) {
  if (kind === CARD) return "Pay online on the gym's Stripe page.";
  if (kind === "cash") return "Pay at the gym. Staff confirm it.";
  return proof
    ? "Send the money, then upload a proof."
    : "Send the money, then tell the gym.";
}

function priceOf(membership: Membership) {
  return membership.amount
    ? formatMoney(membership.amount.priceMinor, membership.amount.currency)
    : null;
}

function PayStep({
  membership,
  options,
  onChangePlan,
}: {
  membership: Membership;
  options: Options;
  onChangePlan?: () => void;
}) {
  const { timeZone, uploadsEnabled } = useEntity();
  const methods = options.methods.filter(
    (m) => !m.offPlanIds.includes(membership.planId),
  );
  const choices: {
    id: string;
    kind: PaymentMethodKind | typeof CARD;
    label: string;
  }[] = [
    ...(membership.cardPaymentUrl
      ? [{ id: CARD, kind: CARD, label: "Card" } as const]
      : []),
    ...methods.map((m) => ({ id: m.id, kind: m.kind, label: m.label })),
  ];
  const [choice, setChoice] = useState<string | null>(
    choices.length === 1 ? (choices[0]?.id ?? null) : null,
  );
  const method = methods.find((m) => m.id === choice);
  const price = priceOf(membership);
  const month = formatMonth(membership.month, timeZone ?? "UTC");

  return (
    <section className="flex flex-col gap-6" aria-label="Pay for your plan">
      {onChangePlan && <Progress current={2} />}

      <div
        className={cn(
          cardClass(),
          "flex flex-wrap items-start justify-between gap-4",
        )}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <Eyebrow>{onChangePlan ? "Your plan" : `Due for ${month}`}</Eyebrow>
          <p className="text-lg font-semibold">{membership.planName}</p>
          <p className="text-muted-foreground text-sm">
            {onChangePlan
              ? `Booking opens once ${month} is paid.`
              : (membership.warning?.headline ??
                "Pay this month to keep booking.")}
          </p>
          {onChangePlan && (
            <Button
              variant="link"
              size="sm"
              className="text-muted-foreground mt-1 self-start px-0"
              onClick={onChangePlan}
            >
              Change plan
            </Button>
          )}
        </div>
        {price && (
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums">{price}</p>
            <p className="text-muted-foreground text-xs">for {month}</p>
          </div>
        )}
      </div>

      {choices.length === 0 ? (
        <EmptyState title="Your gym has not added a way to pay yet.">
          Ask your gym how to pay.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          <h2 id="pay-how" className="text-md font-semibold">
            How do you want to pay?
          </h2>
          <div
            role="radiogroup"
            aria-labelledby="pay-how"
            className="grid gap-2 sm:grid-cols-2"
          >
            {choices.map((c) => {
              const Icon = METHOD_ICONS[c.kind];
              const selected = choice === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setChoice(c.id)}
                  className={cn(
                    cardClass({ variant: "outline", interactive: true }),
                    FOCUS_RING,
                    "flex w-full items-center gap-3 text-left",
                    selected && "border-foreground bg-hover",
                  )}
                >
                  <span className="bg-surface-2 flex size-9 shrink-0 items-center justify-center rounded-md">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium">{c.label}</span>
                    <span className="text-muted-foreground text-sm">
                      {methodHint(c.kind, uploadsEnabled)}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-full border",
                      selected ? "border-foreground" : "border-border-strong",
                    )}
                  >
                    {selected && (
                      <span className="bg-foreground size-2 rounded-full" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {choice === CARD && membership.cardPaymentUrl && (
        <CardPanel membership={membership} price={price} />
      )}
      {method?.kind === "cash" && (
        <CashPanel
          membership={membership}
          method={method}
          staff={options.staff}
          price={price}
        />
      )}
      {method && method.kind !== "cash" && (
        <TransferPanel membership={membership} method={method} price={price} />
      )}
    </section>
  );
}

function useClaim() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.accessPlan.claimMonth.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.accessPlan.pathFilter());
        toast.success("Sent. Your gym will confirm it.");
      },
      onError: (e) =>
        toast.error(e.message || "Couldn't send that. Try again."),
    }),
  );
}

function Steps({ children }: { children: ReactNode }) {
  return (
    <ol className={cn(cardClass(), "flex flex-col gap-6 p-5")}>{children}</ol>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="border-border-strong text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums"
      >
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3 pt-0.5">
        <p className="text-sm font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

function ProofField({
  fileId,
  onChange,
}: {
  fileId: string | null;
  onChange: (fileId: string | null) => void;
}) {
  const { upload, pending } = useReceiptUpload();
  const [name, setName] = useState<string | null>(null);
  const limitMb = FILE_RULES.payment_receipt.maxBytes / (1024 * 1024);

  if (fileId && name) {
    return (
      <div className="border-success/30 bg-success/10 flex items-center gap-3 rounded-md border px-3 py-2">
        <FileCheck className="text-success size-5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm" title={name}>
          {name}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onChange(null);
            setName(null);
          }}
        >
          Remove
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border-border-strong hover:bg-hover relative flex flex-col items-center gap-1 rounded-md border border-dashed px-4 py-6 text-center transition-colors motion-reduce:transition-none",
        "has-[input:focus-visible]:ring-ring has-[input:focus-visible]:ring-2",
        pending && "opacity-70",
      )}
    >
      <input
        type="file"
        aria-label="Upload a photo or PDF of your payment"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        disabled={pending}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-wait"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            onChange(await upload(file));
            setName(file.name);
          } catch (err) {
            onChange(null);
            setName(null);
            toast.error(
              err instanceof Error && err.message
                ? err.message
                : "The upload failed. Try again.",
            );
          }
        }}
      />
      {pending ? (
        <Spinner />
      ) : (
        <Upload className="text-muted-foreground size-5" aria-hidden />
      )}
      <p className="text-sm font-medium" aria-live="polite">
        {pending ? "Uploading…" : "Choose a photo or PDF"}
      </p>
      <p className="text-muted-foreground text-xs">
        A screenshot is enough. Up to {limitMb} MB. Only your gym sees it.
      </p>
    </div>
  );
}

function CardPanel({
  membership,
  price,
}: {
  membership: Membership;
  price: string | null;
}) {
  const trpc = useTRPC();
  const claim = useClaim();
  const { uploadsEnabled } = useEntity();
  const [opened, setOpened] = useState(false);
  const [proof, setProof] = useState<string | null>(null);
  useQuery({
    ...trpc.accessPlan.mine.queryOptions(),
    refetchInterval: opened ? 5000 : false,
  });

  return (
    <div className="flex flex-col gap-3">
      <Steps>
        <Step n={1} title={`Pay ${price ?? ""} on the Stripe page`.trim()}>
          <Button asChild size="lg" className="self-start max-sm:w-full">
            <a
              href={membership.cardPaymentUrl ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpened(true)}
            >
              Pay by card
              <ExternalLink aria-hidden />
            </a>
          </Button>
          <p className="text-muted-foreground text-sm">
            Stripe opens in a new tab.
          </p>
        </Step>
        <Step n={2} title="Come back to this page">
          {opened ? (
            <p
              className="text-muted-foreground flex items-center gap-2 text-sm"
              aria-live="polite"
            >
              <Spinner size="sm" />
              Waiting for Stripe. This page updates on its own.
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              When Stripe confirms the payment, booking opens on its own.
            </p>
          )}
        </Step>
      </Steps>

      <Collapsible>
        <CollapsibleTrigger
          className={cn(
            "text-muted-foreground hover:text-foreground group flex items-center gap-1.5 rounded-sm text-sm",
            FOCUS_RING,
          )}
        >
          Paid, but nothing changed after a few minutes?
          <ChevronDown
            className="size-4 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
            aria-hidden
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className={cn(cardClass(), "mt-3 flex flex-col gap-3")}>
            <p className="text-sm">
              {uploadsEnabled
                ? "Send your gym the receipt Stripe emailed you. They will confirm it."
                : "Tell your gym you paid. They will confirm it."}
            </p>
            {uploadsEnabled && (
              <ProofField fileId={proof} onChange={setProof} />
            )}
            <Button
              variant="outline"
              className="self-start max-sm:w-full"
              busy={claim.isPending}
              disabled={claim.isPending || (uploadsEnabled && !proof)}
              onClick={() =>
                claim.mutate({
                  assignmentId: membership.assignmentId,
                  ...(proof ? { proofFileId: proof } : {}),
                })
              }
            >
              {uploadsEnabled ? "Send receipt to the gym" : "I paid by card"}
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function TransferPanel({
  membership,
  method,
  price,
}: {
  membership: Membership;
  method: Method;
  price: string | null;
}) {
  const claim = useClaim();
  const { uploadsEnabled } = useEntity();
  const [proof, setProof] = useState<string | null>(null);
  const usesReference = paymentMethodUsesReference(method.kind);
  let n = 0;

  return (
    <div className="flex flex-col gap-3">
      <Steps>
        <Step
          n={++n}
          title={`Send ${price ?? "the amount"} by ${method.label}`}
        >
          <div className="bg-background border-border flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-start sm:justify-between">
            <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
              {method.details}
            </p>
            <CopyButton
              value={method.details}
              label={`Copy ${method.label} details`}
              className="shrink-0 self-start"
            />
          </div>
        </Step>
        {usesReference && (
          <Step n={++n} title="Write this reference in the payment">
            <div className="bg-background border-border flex items-center justify-between gap-3 rounded-md border p-3">
              <p className="text-md min-w-0 font-mono break-all">
                {membership.reference}
              </p>
              <CopyButton
                value={membership.reference}
                label="Copy reference"
                className="shrink-0"
              />
            </div>
            <p className="text-muted-foreground text-sm">
              It tells the gym the payment is yours.
            </p>
          </Step>
        )}
        {uploadsEnabled && (
          <Step n={++n} title="Upload a proof of the payment">
            <ProofField fileId={proof} onChange={setProof} />
          </Step>
        )}
      </Steps>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Button
          size="lg"
          className="max-sm:w-full"
          busy={claim.isPending}
          disabled={claim.isPending || (uploadsEnabled && !proof)}
          onClick={() =>
            claim.mutate({
              assignmentId: membership.assignmentId,
              methodId: method.id,
              ...(proof ? { proofFileId: proof } : {}),
            })
          }
        >
          Send for checking
        </Button>
        <p className="text-muted-foreground text-sm">
          {uploadsEnabled && !proof
            ? "Upload the proof first."
            : "You can book while the gym checks it."}
        </p>
      </div>
    </div>
  );
}

function CashPanel({
  membership,
  method,
  staff,
  price,
}: {
  membership: Membership;
  method: Method;
  staff: Options["staff"];
  price: string | null;
}) {
  const claim = useClaim();
  const { timeZone } = useEntity();
  const today = localDateISO(new Date(), timeZone ?? "UTC");
  const [paidTo, setPaidTo] = useState(staff[0]?.userId ?? SOMEONE_ELSE);
  const [paidOn, setPaidOn] = useState(today);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const someoneElse = paidTo === SOMEONE_ELSE;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (someoneElse && name.trim() === "") {
          setError("Write who you paid.");
          return;
        }
        if (!paidOn) {
          setError("Pick the day you paid.");
          return;
        }
        setError(null);
        claim.mutate({
          assignmentId: membership.assignmentId,
          methodId: method.id,
          ...(someoneElse
            ? { cashPaidToName: name.trim() }
            : { cashPaidTo: paidTo }),
          cashPaidOn: paidOn,
          ...(note.trim() ? { note: note.trim() } : {}),
        });
      }}
    >
      <Steps>
        <Step n={1} title={`Pay ${price ?? "the amount"} at the gym`}>
          {method.details && (
            <p className="text-muted-foreground text-sm whitespace-pre-wrap">
              {method.details}
            </p>
          )}
        </Step>
        <Step
          n={2}
          title={<Label htmlFor="cash-paid-to">Who took the money?</Label>}
        >
          <Select
            id="cash-paid-to"
            value={paidTo}
            onChange={(e) => setPaidTo(e.target.value)}
          >
            {staff.map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.name}
              </option>
            ))}
            <option value={SOMEONE_ELSE}>Someone else</option>
          </Select>
          {someoneElse && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="cash-paid-name">Their name</Label>
              <Input
                id="cash-paid-name"
                value={name}
                maxLength={80}
                aria-invalid={error && !name.trim() ? true : undefined}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}
        </Step>
        <Step
          n={3}
          title={<Label htmlFor="cash-paid-on">When did you pay?</Label>}
        >
          <Input
            id="cash-paid-on"
            type="date"
            className="sm:max-w-48"
            value={paidOn}
            min={cashPaidOnEarliest(today)}
            max={today}
            required
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </Step>
        <Step
          n={4}
          title={
            <Label htmlFor="cash-note">
              Note for the gym{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
          }
        >
          <Textarea
            id="cash-note"
            rows={2}
            value={note}
            maxLength={500}
            placeholder="Paid before Tuesday's class."
            onChange={(e) => setNote(e.target.value)}
          />
        </Step>
      </Steps>
      {error && <FieldError>{error}</FieldError>}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <Button
          type="submit"
          size="lg"
          className="max-sm:w-full"
          busy={claim.isPending}
          disabled={claim.isPending}
        >
          I paid in cash
        </Button>
        <p className="text-muted-foreground text-sm">
          Booking opens when the gym confirms it.
        </p>
      </div>
    </form>
  );
}
