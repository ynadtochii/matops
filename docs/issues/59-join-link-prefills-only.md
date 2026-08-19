# 59. A join link prefills the form, it never joins on its own

**Status:** accepted
**Date:** 2026-08-19
**Amends:** [57](57-student-onboarding-funnel.md) (web join is one form).

## Context

ADR 57 made the web join one form: name, phone and email together, then a magic
link that "finishes the join on its own". The profile rode in the link as a
base64url blob in `?p=`, and `/join/[token]` auto-fired `membership.join` from a
`useEffect` as soon as a session existed.

Nothing tied `?p=` to the magic-link verification that was meant to produce it.
Both halves of the URL are public: the invite token is a link the gym hands out,
and `?p=` is a value anyone can encode. So an attacker could mint an invite for
their own academy, encode any name and phone, and send that URL to a signed-in
matops user. On open, with no click at all:

- `joinPending` calls `updateUserProfile` against the **global** `user` row, so
  the victim's name and phone change in every academy they belong to.
- The victim becomes pending in the attacker's academy.
- If they had no active academy set, their active tenant switches to it.

The whole exploit is one link. There is no confirmation step to notice.

## Decision

**`?p=` is a prefill and nothing more.** The signed-in branch of `/join/[token]`
renders the same `ProfileForm` a Google sign-in gets, with the carried values as
`defaultValue`s. Joining takes one press of **Join {Academy}**. The auto-join
component is gone.

The value is still parsed with `NameSchema` / `PhoneSchema` before it reaches an
input, so a crafted link cannot inject a value the mutation would reject.

## Consequences

- The join is one press longer than ADR 57 described. That press is the consent
  the flow was missing: nothing writes to a user's profile or membership without
  a deliberate action in front of it.
- The join email no longer promises "nothing else to fill in". It says the link
  confirms the email and finishes the join.
- The mobile join was never affected: `join/[token].tsx` and `onboarding.tsx`
  both require the student to fill and submit a form.

## Rejected

**A one-time nonce stored beside the verification token, consumed on join.**
That closes the same hole and keeps the zero-click flow, but it adds a table, a
lifetime, and a consumed/expired failure mode to a screen that already has a
working form on it. The form is smaller and it also fixes the general case: a
join should be a thing the person does, not a thing a URL does to them.
