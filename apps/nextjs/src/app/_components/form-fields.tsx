"use client";

import { useId, useState } from "react";

import {
  academyCountry,
  DIAL_COUNTRIES,
  dialForCountry,
  splitE164,
  toE164,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Select } from "@matops/ui/select";

/**
 * What a phone number can be spelled with. Anything else is dropped as it is
 * typed, because `toE164` returns an empty string for a value it cannot read:
 * without this the box shows what the person typed while the form holds
 * nothing, and they get a dead submit button with no way to find out why.
 */
const NOT_PHONE = /[^\d\s().+-]/g;

/**
 * What to say about a field the schema rejected. The schema's own message wins
 * where it was written for a person ("Check the country code and the number");
 * these replace the ones that are Zod's internals and tell a stranger nothing
 * they can act on.
 */
const FIELD_COPY: Record<string, string> = {
  firstName: "Enter your first name",
  lastName: "Enter your last name",
  email: "Enter an email address, like you@example.com",
};

/**
 * Turn a failed parse into one message per field, for a form that validates on
 * submit rather than disabling its own button. Takes the issues rather than the
 * result so it does not care which schema produced them.
 *
 * `phone` is passed separately because an unreadable number reaches the schema
 * as an empty string: `toE164` cannot represent it, so "enter your phone
 * number" is the true thing to say, not the charset rule.
 */
export function fieldErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
  phone: string,
): Record<string, string> {
  const found: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "");
    if (!field || field in found) continue;
    found[field] =
      field === "phone" && phone === ""
        ? "Enter your phone number"
        : (FIELD_COPY[field] ?? issue.message);
  }
  return found;
}

/**
 * The two fields every screen that captures a person uses (ADR 119). Six forms
 * each rolled their own before this, which is how one of them ended up asking
 * for an email it marked optional and another required it.
 */

/**
 * Phone: a country picker beside the number, emitting E.164 upward. The picker
 * opens on the academy's own country, worked out from its time zone, so the
 * common case is that nobody touches it.
 *
 * The country lives in local state rather than being re-derived from `value` on
 * every keystroke: while the number box is empty there is no E.164 to read a
 * country back out of, and a picker that snapped home mid-edit would be worse
 * than one that stays where it was put.
 */
export function PhoneField({
  value,
  onChange,
  timeZone,
  country,
  name,
  label = "Phone",
  hideLabel,
  required,
  disabled,
  error,
  className,
  autoComplete,
}: {
  value: string;
  onChange: (next: string) => void;
  /** The academy's IANA zone, or null on a screen with no academy yet. */
  timeZone: string | null;
  /** The academy's own country, which wins over the one its zone implies. */
  country?: string | null;
  /**
   * Set it when the field also has to reach a server action through FormData.
   * It rides a hidden input, because the visible box holds only the national
   * part and the country lives in the picker beside it.
   */
  name?: string;
  label?: string;
  /** Keep the label for a screen reader but not on screen (a dense inline row). */
  hideLabel?: boolean;
  required?: boolean;
  disabled?: boolean;
  /** What is wrong with this field, shown under it. */
  error?: string;
  className?: string;
  autoComplete?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const home = academyCountry(country, timeZone);
  // Only what the person did is state. The academy arrives from a query, so it
  // is null on the first render of every public form, and an initial-state
  // default computed there would freeze the picker on the fallback country
  // before the real one loaded.
  const [picked, setPicked] = useState<string | null>(null);
  const [national, setNational] = useState(
    () => splitE164(value, home).national,
  );
  const iso =
    picked ?? (value.startsWith("+") ? splitE164(value, home).iso : home);

  const push = (nextIso: string, nextNational: string) => {
    setPicked(nextIso);
    setNational(nextNational);
    onChange(toE164(dialForCountry(nextIso), nextNational));
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className={cn(hideLabel && "sr-only")}>
        {label}
      </Label>
      <div className="flex gap-2">
        <Select
          value={iso}
          onChange={(e) => push(e.target.value, national)}
          disabled={disabled}
          aria-label="Country code"
          className="w-[7.5rem] shrink-0"
        >
          {DIAL_COUNTRIES.map((c) => (
            <option key={c.iso} value={c.iso}>
              {c.dial} {c.iso}
            </option>
          ))}
        </Select>
        <Input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete={autoComplete ?? "tel-national"}
          value={national}
          onChange={(e) => push(iso, e.target.value.replace(NOT_PHONE, ""))}
          placeholder="912 345 678"
          maxLength={20}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="min-w-0 flex-1"
        />
      </div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
      {name && <input type="hidden" name={name} value={value} />}
    </div>
  );
}

/**
 * The domains a gym's members actually type. Completion is a `<datalist>`, so
 * the browser owns the popup, the keyboard and the touch behaviour, and the
 * suggestion is never something the person has to dismiss.
 */
const EMAIL_DOMAINS = [
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "yahoo.com",
  "live.com",
  "proton.me",
  "protonmail.com",
  "me.com",
  "sapo.pt",
];

/** Email: one field, one rule, with the domain completed after the `@`. */
export function EmailField({
  value,
  onChange,
  name,
  label = "Email",
  placeholder = "them@example.com",
  required,
  disabled,
  invalid,
  error,
  hint,
  className,
  autoComplete,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Set it when the field also has to reach a server action through FormData. */
  name?: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  /** What is wrong with this field, shown under it. */
  error?: string;
  hint?: string;
  className?: string;
  autoComplete?: string;
}) {
  const id = useId();
  const listId = `${id}-domains`;
  const errorId = `${id}-error`;
  const at = value.indexOf("@");
  const local = at > 0 ? value.slice(0, at) : "";
  const typed = at >= 0 ? value.slice(at + 1) : null;
  const suggestions =
    local && typed !== null
      ? EMAIL_DOMAINS.filter((d) => d.startsWith(typed.toLowerCase())).map(
          (d) => `${local}@${d}`,
        )
      : [];

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type="email"
        inputMode="email"
        autoComplete={autoComplete ?? "email"}
        autoCapitalize="none"
        spellCheck={false}
        list={suggestions.length > 0 ? listId : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={120}
        required={required}
        disabled={disabled}
        aria-invalid={invalid ?? (error ? true : undefined)}
        aria-describedby={error ? errorId : undefined}
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      {error && <FieldError id={errorId}>{error}</FieldError>}
      {hint && !error && (
        <p className="text-muted-foreground text-xs">{hint}</p>
      )}
    </div>
  );
}
