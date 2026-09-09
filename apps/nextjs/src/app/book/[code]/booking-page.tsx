"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { DAY_MS, dayKey, groupByDay } from "@matops/domain";
import { Button } from "@matops/ui/button";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Spinner } from "@matops/ui/spinner";
import { PublicBookingSchema } from "@matops/validators";

import { ConsentChecks } from "~/app/_components/consents";
import {
  EmailField,
  fieldErrors,
  PhoneField,
} from "~/app/_components/form-fields";
import { MatLoader } from "~/app/_components/mat-loader";
import { useTRPC } from "~/trpc/react";

const BLANK = { firstName: "", lastName: "", phone: "", email: "" };

/** How many days of classes the picker opens on. The rest are one tap away. */
const DAYS_SHOWN = 3;

/** "Mon, 1 Sep · 18:30" from the API's own offset string, in the gym's zone. */
function whenLabel(startsAt: string, timeZone: string): string {
  const at = new Date(startsAt);
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
}

/** Just the clock, for a row already sitting under its own day heading. */
function timeLabel(startsAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(startsAt));
}

/**
 * "Today" / "Tomorrow" / "Wed, 2 Sep" for a day heading. Today and tomorrow are
 * drawn in the GYM's zone, so a visitor reading this from another country is
 * told the gym's today rather than their own. The date itself is read back out
 * of the key, which already names a calendar day and so needs no zone at all.
 */
function dayLabel(key: string, timeZone: string): string {
  if (key === dayKey(new Date(), timeZone)) return "Today";
  if (key === dayKey(new Date(Date.now() + DAY_MS), timeZone))
    return "Tomorrow";
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(year ?? 0, (month ?? 1) - 1, day ?? 1));
}

export function BookingPage({
  code,
  initialToken,
}: {
  code: string;
  initialToken: string | null;
}) {
  const trpc = useTRPC();
  const [bookingToken, setBookingToken] = useState(initialToken);
  const [classId, setClassId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [risk, setRisk] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allDays, setAllDays] = useState(false);
  const [changing, setChanging] = useState(false);

  const schedule = useQuery({
    ...trpc.visitor.schedule.queryOptions({ code }),
    retry: false,
  });
  const booking = useQuery({
    ...trpc.visitor.status.queryOptions({ code, token: bookingToken ?? "" }),
    enabled: bookingToken !== null,
    retry: false,
  });

  const book = useMutation(
    trpc.visitor.book.mutationOptions({
      onSuccess: (data) => {
        setBookingToken(data.token);
        const url = new URL(window.location.href);
        url.searchParams.set("booking", data.token);
        window.history.replaceState(null, "", url);
      },
      onError: (err) => setError(err.message),
    }),
  );
  const cancel = useMutation(
    trpc.visitor.cancel.mutationOptions({
      onSuccess: () => booking.refetch(),
      onError: (err) => setError(err.message),
    }),
  );

  if (schedule.isPending || (bookingToken !== null && booking.isPending)) {
    return <MatLoader label="Opening the schedule" />;
  }
  if (schedule.isError) {
    return (
      <div className="flex max-w-sm flex-col gap-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Booking is closed
        </h1>
        <p className="text-muted-foreground text-sm">
          This gym is not taking online bookings right now. Give them a call.
        </p>
      </div>
    );
  }

  const gym = schedule.data.academy;
  const timeZone = gym.timeZone;

  if (bookingToken && booking.isError) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Booking link expired
        </h1>
        <p className="text-muted-foreground text-sm">
          This booking link is no longer available. Contact {gym.name} if you
          need help.
        </p>
      </div>
    );
  }

  if (bookingToken && booking.data) {
    const row = booking.data;
    const classCancelled = row.class.status === "cancelled";
    const bookingCancelled = row.bookingStatus === "cancelled";
    return (
      <div className="flex w-full max-w-sm flex-col gap-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {classCancelled
            ? "This class was cancelled"
            : bookingCancelled
              ? "Your booking is cancelled"
              : "You are booked"}
        </h1>
        {row.class.changed && !classCancelled && (
          <p className="border-warning/40 bg-warning/10 rounded-md border p-3 text-sm">
            The class time has changed. The current time is shown below.
          </p>
        )}
        <p className="text-sm">
          {row.class.title} · {whenLabel(row.class.startsAt, timeZone)}
        </p>
        {gym.address && (
          <p className="text-muted-foreground text-sm">{gym.address}</p>
        )}
        {!classCancelled && !bookingCancelled && (
          <Button
            type="button"
            variant="outline"
            disabled={cancel.isPending}
            onClick={() => {
              setError(null);
              cancel.mutate({ code, token: bookingToken });
            }}
          >
            {cancel.isPending ? "Cancelling…" : "Cancel booking"}
          </Button>
        )}
        {error && (
          <p role="alert" className="text-error text-sm">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (book.isSuccess) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          You&apos;re booked 🥋
        </h1>
        <p className="text-sm">
          {book.data.class.title} ·{" "}
          {whenLabel(book.data.class.startsAt, timeZone)}
        </p>
        {gym.address && (
          <p className="text-muted-foreground text-sm">{gym.address}</p>
        )}
        {gym.mapUrl && (
          <a
            href={gym.mapUrl}
            className="text-sm underline underline-offset-2"
            target="_blank"
            rel="noreferrer noopener"
          >
            Open the map
          </a>
        )}
        <p className="text-muted-foreground text-sm">
          Come 15 minutes early. Bring water, flip-flops and a training top. You
          sign the gym&apos;s waiver at the desk before you step on the mat.
        </p>
      </div>
    );
  }

  const upcoming = schedule.data.classes;
  const chosen = upcoming.find((c) => c.id === classId) ?? null;
  const days = groupByDay(upcoming, timeZone);
  const shown = allDays ? days : days.slice(0, DAYS_SHOWN);
  const hiddenDays = days.length - shown.length;

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Book a class at {gym.name}
        </h1>
        <p className="text-muted-foreground text-sm">
          Pick a class, leave your details, and turn up. No account needed.
        </p>
      </div>

      {upcoming.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No classes are open in this gym&apos;s booking window. Call the gym
          and they will fit you in.
        </p>
      ) : chosen && !changing ? (
        <div className="border-brand/40 bg-brand-wash flex items-center gap-3 rounded-lg border p-3 text-sm">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">{chosen.title}</span>
            <span className="text-muted-foreground">
              {whenLabel(chosen.startsAt, timeZone)} · {chosen.durationMinutes}{" "}
              min
            </span>
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setChanging(true)}
          >
            Change
          </Button>
        </div>
      ) : (
        <fieldset className="flex flex-col gap-3">
          <legend className="sr-only">Pick a class</legend>
          {shown.map(([key, rows]) => (
            <div key={key} className="flex flex-col gap-1">
              <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {dayLabel(key, timeZone)}
              </h2>
              {rows.map((c) => (
                <label
                  key={c.id}
                  className={`border-border flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm ${
                    c.bookable ? "hover:border-brand/40" : "opacity-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="class"
                    className="accent-brand size-4 shrink-0"
                    checked={classId === c.id}
                    disabled={!c.bookable}
                    onChange={() => {
                      setClassId(c.id);
                      setChanging(false);
                    }}
                  />
                  <span className="shrink-0 font-medium tabular-nums">
                    {timeLabel(c.startsAt, timeZone)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {c.bookable ? `${c.durationMinutes} min` : "starts soon"}
                  </span>
                </label>
              ))}
            </div>
          ))}
          {hiddenDays > 0 && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center self-start text-sm underline underline-offset-2 sm:min-h-0"
              onClick={() => setAllDays(true)}
            >
              Show the rest of the week
            </button>
          )}
        </fieldset>
      )}

      {chosen && (
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const payload = {
              classId: chosen.id,
              firstName: form.firstName.trim(),
              lastName: form.lastName.trim(),
              phone: form.phone,
              email: form.email.trim(),
              consent,
              source: "link" as const,
            };
            const parsed = PublicBookingSchema.safeParse(payload);
            const found = fieldErrors(
              parsed.success ? [] : parsed.error.issues,
              form.phone,
            );
            if (!risk) {
              found.risk = "Please confirm you understand the training risks";
            }
            if (Object.keys(found).length > 0) {
              setErrors(found);
              return;
            }
            setErrors({});
            book.mutate({
              code,
              booking: { ...payload, consent: true },
            });
          }}
        >
          <Field
            id="bk-first"
            label="First name"
            autoComplete="given-name"
            value={form.firstName}
            onChange={(v) => setForm({ ...form, firstName: v })}
            error={errors.firstName}
          />
          <Field
            id="bk-last"
            label="Last name"
            autoComplete="family-name"
            value={form.lastName}
            onChange={(v) => setForm({ ...form, lastName: v })}
            error={errors.lastName}
          />
          <PhoneField
            timeZone={timeZone}
            country={gym.country}
            value={form.phone}
            onChange={(v) => setForm({ ...form, phone: v })}
            required
            error={errors.phone}
          />
          <EmailField
            value={form.email}
            onChange={(v) => setForm({ ...form, email: v })}
            placeholder="you@example.com"
            required
            error={errors.email}
          />

          <ConsentChecks
            academyName={gym.name}
            contact={consent}
            onContact={setConsent}
            contactError={errors.consent}
            risk={risk}
            onRisk={setRisk}
            riskError={errors.risk}
          />

          <p className="text-muted-foreground text-xs">
            Booking holds you a place. You sign the gym&apos;s waiver at the
            desk before your first session.
          </p>

          {error && (
            <p role="alert" className="text-error text-sm">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" disabled={book.isPending}>
            {book.isPending && <Spinner size="sm" className="text-current" />}
            {book.isPending ? "Booking…" : "Book this class"}
          </Button>
        </form>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  type?: string;
  autoComplete?: string;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        maxLength={120}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}
