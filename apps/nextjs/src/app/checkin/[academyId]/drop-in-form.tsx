"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Spinner } from "@matops/ui/spinner";
import { DropInSchema } from "@matops/validators";

import { ConsentChecks } from "~/app/_components/consents";
import {
  EmailField,
  fieldErrors,
  PhoneField,
} from "~/app/_components/form-fields";
import { dayShortFmt, time24Fmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";

function classLabel(startsAt: Date, now: Date): string {
  const time = time24Fmt.format(startsAt);
  return startsAt.toDateString() === now.toDateString()
    ? time
    : `${dayShortFmt.format(startsAt)}, ${time}`;
}

/**
 * The public drop-in form (spec §4, slice 3.5). Name, phone and email, a
 * required consent tick, and which class they are here for. Unauthenticated: it
 * uses the public `dropIn` procedures.
 *
 * The class list is offered rather than guessed. Two classes running at once
 * used to leave the lead attached to nothing, which lost the one fact the gym
 * most wanted: what this person came to try.
 *
 * **The button is never disabled for validation.** It was, and a value the
 * phone field could not parse then produced a dead end: the box showed what the
 * person typed, `toE164` handed the form an empty string, and the only feedback
 * was a button that would not press. Submitting always does something now, and
 * anything wrong is named on the field it belongs to.
 */
export function DropInForm({ academyId }: { academyId: string }) {
  const trpc = useTRPC();
  const academy = useQuery(
    trpc.dropIn.academyInfo.queryOptions({ academyId }, { retry: false }),
  );

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [risk, setRisk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // undefined = not chosen yet, null = "just visiting", string = a class id.
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);

  const submit = useMutation(
    trpc.dropIn.submit.mutationOptions({
      onError: (err) => {
        setError(err.message || "Could not check in");
        // The class list is the likely reason a submit was refused, so pull a
        // fresh one: leaving a class on screen that the server just rejected
        // invites the same refusal again.
        void academy.refetch();
      },
    }),
  );

  useEffect(() => {
    if (Object.keys(errors).length === 0) return;
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [errors]);

  const clearError = (field: string) =>
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  if (academy.isError) {
    return (
      <div className="flex max-w-sm flex-col gap-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Gym not found</h1>
        <p className="text-muted-foreground text-sm">
          This check-in link isn&apos;t valid. Please ask the front desk.
        </p>
      </div>
    );
  }

  if (submit.isSuccess) {
    const { booked, classTitle, firstVisit } = submit.data;
    return (
      <div className="flex max-w-sm flex-col gap-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {booked ? "You're booked 🥋" : "You're checked in 🥋"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {booked
            ? `We saved you a place on ${classTitle}. Come a few minutes early to sign the waiver.`
            : firstVisit
              ? "Welcome! The gym will follow up with you."
              : "Good to see you back. Enjoy the session."}
        </p>
      </div>
    );
  }

  const now = new Date();
  const timeZone = academy.data?.timeZone ?? null;
  const country = academy.data?.country ?? null;
  const classesNow = academy.data?.classesNow ?? [];
  const classesUpcoming = academy.data?.classesUpcoming ?? [];
  const hasChoice = classesNow.length + classesUpcoming.length > 0;
  // One class on and nothing to weigh it against: they can only be here for it.
  const auto = classesNow.length === 1 ? classesNow[0]?.id : undefined;
  const selected = picked === undefined ? auto : picked;
  const booking =
    selected != null && classesUpcoming.some((c) => c.id === selected);

  const choice = (value: string | null, title: string, hint: string | null) => (
    <label
      key={value ?? "none"}
      className={`flex cursor-pointer items-center gap-2.5 rounded-md border p-2.5 text-sm transition-colors ${
        selected === value
          ? "border-primary bg-primary/5"
          : errors.classId
            ? "border-error"
            : "border-input"
      }`}
    >
      <input
        type="radio"
        name="di-class"
        checked={selected === value}
        onChange={() => {
          setPicked(value);
          clearError("classId");
        }}
      />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {hint && (
        <span className="text-muted-foreground shrink-0 text-xs">{hint}</span>
      )}
    </label>
  );

  return (
    <form
      ref={formRef}
      noValidate
      className="flex w-full max-w-sm flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);

        const payload = {
          academyId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone,
          email: email.trim(),
          consent,
          classId: selected ?? undefined,
        };
        const parsed = DropInSchema.safeParse(payload);
        const found = fieldErrors(
          parsed.success ? [] : parsed.error.issues,
          phone,
        );
        if (hasChoice && selected === undefined) {
          found.classId = "Pick a class, or tell us you're just visiting";
        }
        if (!risk) {
          found.risk = "Please confirm you understand the training risks";
        }
        if (Object.keys(found).length > 0) {
          setErrors(found);
          return;
        }

        setErrors({});
        submit.mutate({ ...payload, consent: true });
      }}
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Check in{academy.data ? ` at ${academy.data.name}` : ""}
        </h1>
        <p className="text-muted-foreground text-sm">
          First time here? Leave your details so the gym can welcome you.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="di-first">First name</Label>
        <Input
          id="di-first"
          value={firstName}
          onChange={(e) => {
            setFirstName(e.target.value);
            clearError("firstName");
          }}
          autoComplete="given-name"
          maxLength={60}
          required
          aria-invalid={errors.firstName ? true : undefined}
          aria-describedby={errors.firstName ? "di-first-error" : undefined}
        />
        {errors.firstName && (
          <FieldError id="di-first-error">{errors.firstName}</FieldError>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="di-last">Last name</Label>
        <Input
          id="di-last"
          value={lastName}
          onChange={(e) => {
            setLastName(e.target.value);
            clearError("lastName");
          }}
          autoComplete="family-name"
          maxLength={60}
          required
          aria-invalid={errors.lastName ? true : undefined}
          aria-describedby={errors.lastName ? "di-last-error" : undefined}
        />
        {errors.lastName && (
          <FieldError id="di-last-error">{errors.lastName}</FieldError>
        )}
      </div>
      <PhoneField
        timeZone={timeZone}
        country={country}
        value={phone}
        onChange={(v) => {
          setPhone(v);
          clearError("phone");
        }}
        required
        error={errors.phone}
      />
      <EmailField
        value={email}
        onChange={(v) => {
          setEmail(v);
          clearError("email");
        }}
        placeholder="you@example.com"
        required
        error={errors.email}
      />

      {hasChoice && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">
            {classesNow.length > 0
              ? "Which class are you here for?"
              : "Which class would you like to try?"}
          </legend>
          {classesNow.map((c) =>
            choice(c.id, c.title, `${classLabel(c.startsAt, now)} · on now`),
          )}
          {classesUpcoming.map((c) =>
            choice(c.id, c.title, classLabel(c.startsAt, now)),
          )}
          {choice(null, "I'm just visiting", null)}
          {errors.classId && <FieldError>{errors.classId}</FieldError>}
        </fieldset>
      )}

      <ConsentChecks
        academyName={academy.data?.name ?? ""}
        contact={consent}
        onContact={(v) => {
          setConsent(v);
          clearError("consent");
        }}
        contactError={errors.consent}
        risk={risk}
        onRisk={(v) => {
          setRisk(v);
          clearError("risk");
        }}
        riskError={errors.risk}
      />

      {error && (
        <p role="alert" className="text-error text-sm">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={submit.isPending}>
        {submit.isPending && <Spinner size="sm" className="text-current" />}
        {submit.isPending
          ? booking
            ? "Booking…"
            : "Checking in…"
          : booking
            ? "Book my place"
            : "Check in"}
      </Button>
    </form>
  );
}
