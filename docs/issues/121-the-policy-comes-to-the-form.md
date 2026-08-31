# 121 — The policy comes to the form, and the mat has a warning on it

**Status:** accepted · **Date:** 2026-08-30 · **Area:** `apps/nextjs` (`_components/policy-text.tsx`, `_components/consents.tsx`, the public drop-in form, the public booking page, `/privacy`). **No migration.** **Relates to:** [25](25-dropin-lead-form.md), [76](76-pilot-blockers.md), [115](115-public-booking-api-and-the-lead-path.md), [120](120-a-form-never-goes-dead.md).

## Context

Two problems on the same three lines of both public forms.

**The privacy link threw the form away.** It was an `href` to `/privacy`. A
stranger who wanted to know what the gym stores before ticking the box left a
page holding their name, phone, email and class pick, and got it all back only
if the back button and the browser's form restoration both behaved. Reading the
policy is the responsible thing to do, and we charged them for it. That is the
same failure as ADR 120's dead button: the form punishing someone for using it
properly.

**Nothing told them what training is.** Grappling is full contact. Someone
scanning a poster on the wall and booking their first session was told the gym
would contact them and nothing else. The confirmation mentioned a waiver signed
at the desk, which is after they have already committed.

## Decision

### 1. A policy opens where the person already is

Both documents open in a dialog. The form stays mounted underneath, so every
field is exactly as it was left. Nothing is remembered, restored or re-fetched,
because nothing is ever unmounted.

### 2. One copy of the words

`policy-text.tsx` holds the prose with no page chrome and no hooks, so the
`/privacy` route and the dialog render the same component. A privacy page that
disagrees with the privacy dialog is worse than either alone, and two copies of
legal text drift the first time one is edited.

### 3. A second tick, for the risk

A required checkbox: "I understand training is full contact and carries a risk
of injury", with the notice a click away. The notice names the **academy**, not
matops, because the limit of liability is the gym's. It ends by saying it is not
the waiver: the waiver is signed at the desk, and a tick on a phone must not be
mistaken for one.

### 4. It gates, it does not record, and that is the decision

**The tick is enforced in the browser and stored nowhere.** No column, no field
on `PublicBookingSchema`, no migration. This is settled, not deferred.

The reason is that matops already has a record, and it is not this one. The
**waiver signed at the desk** is what the gym relies on, and every surface says
so: the notice, the booking confirmation, and `docs/public-api.md`'s contract
for integrators. A tick on a stranger's phone would be a weaker copy of a
document that already exists on paper, and storing it would invite someone to
treat it as the stronger one.

So the tick does the one job it is good at: it makes a person read what training
involves before they commit to a first session. Signposting, not evidence.

### 5. The privacy text says less

The page listed the companies that run parts of matops by name, and the
database, hosting, email and error-reporting vendors with it. A visitor deciding
whether to leave a phone number does not need our stack, and a list of vendor
names is a maintenance burden that goes stale the first time one is swapped. It
is replaced by the two facts that matter to the reader: the data is stored in
the **EU**, and whoever handles it does so on our instructions and nothing more.
The rest of the page was cut to the same standard.

## Consequences

- The words shown to a visitor are the standard notice with the academy's name
  in it. A gym that wants its own wording has no way to set it, which is the
  next question this raises.
- The public REST API is unchanged, so a visitor booking through a gym's own
  site sees no risk notice. Integrators show the two lines `docs/public-api.md`
  already requires, and the desk waiver covers them the same way it covers ours.
- The privacy page and the dialog are one component, so trimming it was one
  edit rather than two that could disagree.
