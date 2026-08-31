# 117 — The visitor picks the class

**Status:** accepted · **Date:** 2026-08-30 · **Area:** `packages/domain` (`src/checkin.ts`), `packages/api` (`src/router/dropin.ts`), `packages/validators`, `packages/db` (`src/dropin.ts`), the public `/checkin/<academyId>` page. **No migration.** **Relates to:** [24](24-qr-self-checkin.md) (the check-in window and the overlap rule), [25](25-dropin-lead-form.md) (the form itself), [115](115-public-booking-api-and-the-lead-path.md) (`drop_in_visit`, and the booking path this reuses).

## Context

A visitor scans the poster on the gym wall and fills in the drop-in form. Until
now the form never asked which class they were there for. The server guessed:
it resolved the classes open for check-in and attached one **only when exactly
one was on**.

That guess fails in the two cases a gym actually cares about.

**Two classes at once.** A gi class and a no-gi class run side by side, which is
normal in any gym with two mats. `resolveCheckInClass` returns both, the count
is not one, and the lead is written attached to nothing. The gym gets a name and
a phone number and loses the single fact it most wanted: what this person came
to try. The rule in ADR 24 already said a 2+ overlap means "the caller asks
which". The member check-in screen in the Expo app does exactly that. The
visitor form was the one caller that never implemented its half.

**No class on.** Someone walks past at three in the afternoon and scans the
poster to ask about training. There is nothing to attach, so again the lead
holds no class. But this person has a clear intention and there is a perfectly
good class at seven. Nothing in the product could capture that.

Meanwhile ADR 115 built a stranger-facing booking path for exactly this
intention, and gave it to the gym's **website**. The person standing in the
building had no way to reach it.

## Decision

**The form asks.** `dropIn.academyInfo` now returns the classes to offer, and
`dropIn.submit` takes the visitor's pick.

### 1. Two lists, because they mean different things

`visitorClassChoices` in `packages/domain` splits the academy's classes into:

- **`now`**: the check-in set, straight from `resolveCheckInClass`. Picking one
  of these means the person is in the room, so it writes an **attendance**.
- **`upcoming`**: everything later they could come back for. Picking one writes
  a **booking**, which staff can later mark present or absent.

A class starting within the next hour is already inside the check-in window, so
it is removed from `upcoming` by id. Offering the same class twice, once to
attend and once to book, is a choice nobody can answer.

### 2. The pick is a hint, never a fact

`classId` arrives on a public, unauthenticated write, so it is not trusted. The
submit re-resolves the lists at write time and refuses an id that is not on
them. A class that ended while the form sat open, one the owner cancelled, and
one belonging to another gym are all the same refusal. The page cannot widen
what it is entitled to offer by editing its own request.

### 3. Picking nothing stays a real outcome

"I'm just visiting" is an option on the form, and it writes the lead with no
visit. That is the old behavior, kept, but it is now something the visitor
**chose** rather than something that happened to them because the clock was
ambiguous. When exactly one class is on it is pre-selected, so the common case
is still one tap.

### 4. Reuse, not a second path

The write goes through `createDropIn` (attendance) or `bookVisitor` (booking),
the same two helpers the front desk and the public API already use. Everything
that follows is unchanged: the dedupe by phone, one row per lead per class, the
cancel token, the lead pipeline, the stage, because none of it is new.

## Consequences

- A gym with overlapping classes gets its leads attached to the right mat.
- A walk-in between classes can book the evening session from the wall poster,
  which is the public booking API's job done for the person who is already
  standing in the gym.
- `listAcademyClassesInWindow` now returns the class title, because a stranger
  choosing between two classes needs to read their names. It still returns
  nothing about capacity, counts or who teaches: a visitor picking a class has
  no business knowing any of it.
- Two tests written for the guess (`counts a second visit when it is a different
  class`, `keeps a visitor on the first class's register after a second class`)
  set up two overlapping classes and expected the first submit to attach one.
  Under the guess it attached neither. They now say which class the visitor
  picked, which is both deterministic and the behavior being described.

## Not in this

- **Staff booking a lead onto a future class.** The leads screen still shows
  `nextBookingAt` it cannot create, and the desk's "Add visitor" box is still
  capped at the markable window. A lead who phones the gym is not covered.
- Cancelling from the wall form (the public API has the token path; this does
  not surface it).
- Picking a class more than 24 hours out, or a class on a day the visitor
  chooses. The list is what is open now plus what is coming, capped at six.
