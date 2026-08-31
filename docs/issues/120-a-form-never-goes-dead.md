# 120 — A form never goes dead

**Status:** accepted · **Date:** 2026-08-30 · **Area:** `apps/nextjs` (`_components/form-fields.tsx`, the public drop-in form, the public booking page). **No migration.** **Relates to:** [25](25-dropin-lead-form.md), [115](115-public-booking-api-and-the-lead-path.md) (the booking page), [117](117-the-visitor-picks-the-class.md) (the class picker on the same form), [119](119-one-way-to-ask-for-a-phone-and-an-email.md) (the shared fields this fixes).

## Context

A visitor filled in the wall-poster check-in form, typed something that was not
a phone number, and reached a dead end. No message, no way forward, and a form
that looked complete. Three things had to line up for that, and all three were
ours.

1. **The phone field threw the value away.** `PhoneField` emits E.164 upward,
   and `toE164` returns an **empty string** for anything it cannot read. The box
   went on showing what the person typed while the form held nothing.
2. **The submit button was disabled on that empty value.** `canSubmit` required
   a phone of at least three characters, so the button died. A disabled button
   states no reason and answers no question. There is nothing to click, so
   there is nothing to learn.
3. **Native validation never got a turn.** The email was `ewe`, which
   `type="email"` and `required` would have caught. The browser only checks on
   submit, and submit could not happen, so even the fallback was silenced.

The same three conditions held on the public `/book/<code>` page, which is the
page strangers reach from a gym's own website.

## Decision

**A submit button is disabled only while its request is in flight.** Never for
validation. Pressing it always does something: it either sends, or it says what
is wrong and where.

### 1. The field stops eating input

`PhoneField` drops characters a phone number cannot contain as they are typed,
so a letter never enters the box. The visible value and the value the form holds
can no longer disagree. This is the root fix: it applies to all six forms that
share the field, not just the two whose buttons changed.

### 2. Validation runs on submit, against the schema that will run on the server

The form parses the exact payload it is about to send with the same schema the
procedure uses (`DropInSchema`, `PublicBookingSchema`). The client and the
server cannot disagree about what is valid, because it is one schema. The form
carries `noValidate`, so the browser's own bubbles do not race ours.

### 3. The message goes on the field, in words a stranger can act on

One message per field, rendered with the existing `FieldError`, with
`aria-invalid` on the control and `aria-describedby` pointing at the text. The
first invalid control takes focus. A message clears as soon as that field is
edited, so nothing accuses someone of a mistake they have already fixed.

`fieldErrors` keeps the schema's own message where it was written for a person
("Check the country code and the number") and replaces the ones that are Zod's
internals ("Too small: expected string to have >=1 characters"). An unreadable
phone reaches the schema as an empty string, so it is reported as "Enter your
phone number" rather than a charset rule about a value nobody can see.

### 4. A refused submit refreshes what it offered

When the drop-in submit is refused, the class list is refetched. The likely
reason is a class that closed while the form sat open, and leaving it on screen
invites the same refusal again, which is the same dead end wearing a message.

## Consequences

- Two public forms now explain themselves. Both are stranger-facing, and neither
  had a person to ask.
- The button label follows the action: the drop-in form reads **Book my place**
  when the pick is a class later on, and **Check in** when it is one on now,
  matching the confirmation that follows ("You're booked" / "You're checked in").

## Still open

The same disabled-button pattern is in two staff-facing forms, and both have the
phone trap: `class-roster.tsx` ("Add visitor", gated on `visitorValid`) and
`profile-screen.tsx` (Save, gated on `parsed.success`). Neither is a stranger
with nobody to ask, so they are a separate slice rather than an emergency.
