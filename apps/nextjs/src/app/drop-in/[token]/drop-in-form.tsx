"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@matops/ui/dialog";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { FOCUS_RING } from "@matops/ui/motion";
import {
  DropInClassesSchema,
  DropInLookupSchema,
  NameSchema,
} from "@matops/validators";

import type { SignupWaiver } from "~/app/_components/signup-fields";
import {
  EmailField,
  fieldErrors,
  PhoneField,
} from "~/app/_components/form-fields";
import { PRIVACY_UPDATED, PrivacyText } from "~/app/_components/policy-text";
import {
  AgreementField,
  readSignupAnswers,
  signupQuestionErrors,
  SignupQuestions,
} from "~/app/_components/signup-fields";
import { ErrorState } from "~/app/_components/states";
import { useTRPC } from "~/trpc/react";

type Errors = Partial<Record<string, string>>;

interface Match {
  firstName: string;
  needsAgreement: boolean;
}

function useClassLabel(timeZone: string | undefined) {
  return useMemo(() => {
    const fmt = new Intl.DateTimeFormat(undefined, {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    return (startsAt: Date) => fmt.format(startsAt);
  }, [timeZone]);
}

export function DropInForm({
  token,
  linkedClassId,
  sharedBy,
}: {
  token: string;
  linkedClassId: string | null;
  sharedBy?: string;
}) {
  const trpc = useTRPC();
  const academy = useQuery(
    trpc.dropIn.resolve.queryOptions({ token }, { retry: false }),
  );
  const linkedQueryId = DropInClassesSchema.shape.classId.safeParse(
    linkedClassId ?? undefined,
  ).data;
  const classes = useQuery(
    trpc.dropIn.classes.queryOptions(
      { token, classId: linkedQueryId },
      { retry: false, staleTime: 30_000, enabled: academy.isSuccess },
    ),
  );
  const label = useClassLabel(academy.data?.timeZone);

  const [classId, setClassId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [checked, setChecked] = useState<{
    key: string;
    match: Match | null;
  } | null>(null);
  const [declined, setDeclined] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);

  const contactCheck = DropInLookupSchema.safeParse({ token, email, phone });
  const parsed = contactCheck.success
    ? { email: contactCheck.data.email, phone: contactCheck.data.phone }
    : null;
  const key = parsed ? `${parsed.email}|${parsed.phone}` : null;
  const current = checked?.key === key ? checked : null;

  const lookup = useMutation(
    trpc.dropIn.lookup.mutationOptions({
      onSuccess: (res, input) =>
        setChecked({ key: `${input.email}|${input.phone}`, match: res.match }),
      onError: (err) => setError(err.message || "Try again."),
    }),
  );
  const submit = useMutation(
    trpc.dropIn.submit.mutationOptions({
      onError: (err) => {
        setError(err.message || "Couldn't save that. Try again.");
        setChecked(null);
        void classes.refetch();
      },
    }),
  );

  const findMe = () => {
    setError(null);
    if (!parsed) {
      setErrors(fieldErrors(contactCheck.error?.issues ?? [], phone));
      return;
    }
    setErrors({});
    startLookup();
  };

  const startLookup = () => {
    if (!parsed || current || lookup.isPending) return;
    setDeclined(false);
    lookup.mutate({ token, ...parsed });
  };

  if (academy.isError) {
    const code = academy.error.data?.code;
    if (code !== "NOT_FOUND" && code !== "BAD_REQUEST") {
      return (
        <div className="w-full max-w-sm">
          <ErrorState
            label="this form"
            onRetry={() => void academy.refetch()}
          />
        </div>
      );
    }
    return (
      <div role="status" className="flex max-w-sm flex-col gap-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Link not valid
        </h1>
        <p className="text-muted-foreground text-sm">
          This link isn&apos;t valid anymore. Ask the gym for a new one.
        </p>
      </div>
    );
  }

  if (submit.isSuccess) {
    const { mode, classTitle, startsAt } = submit.data;
    return (
      <div role="status" className="flex max-w-sm flex-col gap-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === "book" ? "You're booked" : "You're checked in"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {mode === "book"
            ? `We saved you a place on ${classTitle}, ${label(startsAt)}.`
            : `Enjoy ${classTitle}.`}
        </p>
      </div>
    );
  }

  const name = academy.data?.name ?? "";
  const now = classes.data?.now ?? [];
  const upcoming = classes.data?.upcoming ?? [];
  const all = [...now, ...upcoming];
  const linkedClass = linkedClassId
    ? all.find((c) => c.id === linkedClassId)
    : null;
  const selected = linkedClassId
    ? (linkedClass?.id ?? null)
    : all.some((c) => c.id === classId)
      ? classId
      : null;
  const attending = now.some((c) => c.id === selected);
  const action = attending ? "Check in" : "Book my place";
  const waiver: SignupWaiver | null = academy.data?.waiver ?? null;
  const mode = !current
    ? "contact"
    : current.match && !declined
      ? "confirm"
      : "full";

  const choice = (
    c: { id: string; title: string; startsAt: Date },
    hint: string,
  ) => (
    <label
      key={c.id}
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md border p-2.5 text-sm transition-colors motion-reduce:transition-none",
        selected === c.id
          ? "border-primary bg-active"
          : errors.classId
            ? "border-error bg-card"
            : "border-border bg-card hover:border-border-strong hover:bg-hover",
      )}
    >
      <input
        type="radio"
        name="dropin-class"
        className={cn("accent-primary size-3.5 shrink-0", FOCUS_RING)}
        checked={selected === c.id}
        onChange={() => {
          setClassId(c.id);
          setErrors((prev) => ({ ...prev, classId: undefined }));
        }}
      />
      <span className="text-foreground min-w-0 flex-1 truncate">{c.title}</span>
      <span className="text-muted-foreground shrink-0 text-xs">{hint}</span>
    </label>
  );

  const clearFieldError = (e: React.FormEvent<HTMLFormElement>) => {
    const field = (e.target as HTMLInputElement).name;
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const requireClass = (): string | null => {
    if (selected) return selected;
    setErrors((prev) => ({ ...prev, classId: "Pick a class first." }));
    return null;
  };

  const submitReturning = (form: HTMLFormElement) => {
    const id = requireClass();
    if (!id || !parsed || !current?.match) return;
    const data = new FormData(form);
    const found = signupQuestionErrors(data, {
      belt: false,
      agreement: current.match.needsAgreement && waiver !== null,
    });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    submit.mutate({
      kind: "returning",
      token,
      ...parsed,
      classId: id,
      sharedBy,
      waiverId: current.match.needsAgreement ? waiver?.id : undefined,
    });
  };

  const submitNew = (form: HTMLFormElement) => {
    const id = requireClass();
    if (!id || !parsed) return;
    const data = new FormData(form);
    const first = NameSchema.safeParse(data.get("firstName") ?? "");
    const last = NameSchema.safeParse(data.get("lastName") ?? "");
    const found: Errors = {
      ...signupQuestionErrors(data, { belt: true, agreement: waiver !== null }),
    };
    if (!first.success) found.firstName = "Enter your first name";
    if (!last.success) found.lastName = "Enter your last name";
    setErrors(found);
    if (Object.keys(found).length > 0 || !first.success || !last.success) {
      requestAnimationFrame(() =>
        form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    submit.mutate({
      kind: "new",
      token,
      ...parsed,
      classId: id,
      sharedBy,
      firstName: first.data,
      lastName: last.data,
      consent: true,
      ...readSignupAnswers(data, {
        askHealth: academy.data?.signupHealthQuestion ?? false,
        waiver,
      }),
    });
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Train at {name}
        </h1>
        <p className="text-muted-foreground text-sm text-pretty">
          {linkedClassId
            ? "Leave your details to join this class. No account needed."
            : "Pick a class and leave your details. No account needed."}
        </p>
      </div>

      {classes.isError ? (
        <ErrorState
          label="the classes"
          onRetry={() => void classes.refetch()}
        />
      ) : classes.isSuccess && linkedClassId && !selected ? (
        <p role="status" className="text-muted-foreground text-sm">
          This class is no longer available for drop-ins. Ask the gym for a new
          link.
        </p>
      ) : classes.isSuccess && all.length === 0 ? (
        <p role="status" className="text-muted-foreground text-sm">
          There are no classes in the next three days. Ask the gym when to come.
        </p>
      ) : linkedClassId ? (
        linkedClass && (
          <div className="border-border bg-card rounded-md border p-3 text-sm">
            <p className="font-medium">{linkedClass.title}</p>
            <p className="text-muted-foreground">
              {label(linkedClass.startsAt)}
            </p>
          </div>
        )
      ) : (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">
            Which class would you like?
          </legend>
          {now.map((c) => choice(c, "On now"))}
          {upcoming.map((c) => choice(c, label(c.startsAt)))}
          <FieldError className="sr-only">{errors.classId}</FieldError>
        </fieldset>
      )}

      {selected !== null || (!linkedClassId && all.length > 0) ? (
        <div
          className="flex flex-col gap-3"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) startLookup();
          }}
        >
          <EmailField
            value={email}
            onChange={(v) => {
              setEmail(v);
              setErrors((prev) => ({ ...prev, email: undefined }));
            }}
            placeholder="you@example.com"
            required
            error={errors.email}
            quietError
          />
          <PhoneField
            timeZone={academy.data?.timeZone ?? null}
            country={academy.data?.country ?? null}
            value={phone}
            onChange={(v) => {
              setPhone(v);
              setErrors((prev) => ({ ...prev, phone: undefined }));
            }}
            required
            error={errors.phone}
            quietError
          />
          {mode === "contact" && (
            <Button
              type="button"
              size="lg"
              onClick={findMe}
              disabled={lookup.isPending}
              busy={lookup.isPending}
            >
              Continue
            </Button>
          )}
        </div>
      ) : null}

      {mode === "confirm" && current?.match && (!linkedClassId || selected) && (
        <form
          noValidate
          className="flex flex-col gap-3"
          onChange={clearFieldError}
          onSubmit={(e) => {
            e.preventDefault();
            submitReturning(e.currentTarget);
          }}
        >
          <p className="text-sm font-medium">
            Are you {current.match.firstName}?
          </p>
          {current.match.needsAgreement && waiver && (
            <AgreementField waiver={waiver} error={errors.agreement} />
          )}
          <Button
            type="submit"
            size="lg"
            disabled={submit.isPending}
            busy={submit.isPending}
          >
            Yes. {action}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDeclined(true);
              setErrors({});
            }}
          >
            No, that&apos;s not me
          </Button>
        </form>
      )}

      {mode === "full" && (!linkedClassId || selected) && (
        <form
          noValidate
          className="flex flex-col gap-3"
          onChange={clearFieldError}
          onSubmit={(e) => {
            e.preventDefault();
            submitNew(e.currentTarget);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              name="firstName"
              autoComplete="given-name"
              maxLength={60}
              required
              aria-invalid={errors.firstName ? true : undefined}
              aria-describedby={
                errors.firstName ? "firstName-error" : undefined
              }
            />
            <FieldError id="firstName-error" className="sr-only">
              {errors.firstName}
            </FieldError>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              name="lastName"
              autoComplete="family-name"
              maxLength={60}
              required
              aria-invalid={errors.lastName ? true : undefined}
              aria-describedby={errors.lastName ? "lastName-error" : undefined}
            />
            <FieldError id="lastName-error" className="sr-only">
              {errors.lastName}
            </FieldError>
          </div>
          <SignupQuestions
            academyName={name}
            askHealth={academy.data?.signupHealthQuestion ?? false}
            waiver={waiver}
            errors={errors}
          />
          <p className="text-muted-foreground text-xs">
            By continuing, you agree that {name} can contact you about training.{" "}
            <Dialog>
              <DialogTrigger
                type="button"
                className={`hover:text-foreground rounded-sm underline underline-offset-2 ${FOCUS_RING}`}
              >
                What the gym stores about you
              </DialogTrigger>
              <DialogContent>
                <DialogTitle>Privacy at MatOps</DialogTitle>
                <DialogDescription>
                  Last updated {PRIVACY_UPDATED}.
                </DialogDescription>
                <PrivacyText />
              </DialogContent>
            </Dialog>
          </p>
          <Button
            type="submit"
            size="lg"
            disabled={submit.isPending}
            busy={submit.isPending}
          >
            {action}
          </Button>
        </form>
      )}

      {error && <FieldError role="alert">{error}</FieldError>}
    </div>
  );
}
