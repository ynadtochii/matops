# 56 — The referrals screen reads referrer-first

**Status:** accepted · **Date:** 2026-08-19 · **Area:** staff web (O9) · **Amends:** [52](52-internal-referral-tracking.md)

## Context

ADR 52 shipped O9 as a student ledger: every student membership got a row, and
every row carried its own referrer `<select>` and confirm button. Recording a
referral happens a handful of times a month, so the page put its rarest action
in forty places at once, and the five filter dimensions above it (referrer,
membership state, plan, dues, removed) framed the screen as a reporting tool
you had to operate before it told you anything.

The question the screen exists to answer is "who brings people in". That person
was a 15rem side rail used as a filter control.

## Decision

- The screen reads **referrer-first**. The main list is the people who brought
  students in, ranked by how many, each showing its confirmed month/lifetime
  revenue and the students themselves as a row of chips. Students with nobody
  credited are a second, smaller section, not the page.
- **One dialog owns every write.** "Record a referral" in the page header opens
  it empty; clicking an uncredited student opens it with that student filled in;
  an owner clicking a student chip opens it as a correction. The per-row selects
  and the nested `ConfirmDialog` are gone — the dialog is itself the deliberate
  step, and it states the permanence in plain words above the save button.
- The student picker only offers what the caller may actually do: uncredited
  students for everyone, plus an "already credited" group for owners. An
  instructor can no longer reach a locked state, so the per-row "locked" notices
  collapse into one line under the list.
- **Filters cut from six controls to two**: one search over people (it matches a
  referrer or any of their students) and "show removed students". Membership
  state stays visible as a dot and a word on each person, not as a filter.
- The summary is **one sentence with mono numerals**, not a five-cell metrics
  band. Plan and dues state leave O9 entirely; they are O4 and O7's job and were
  never used to make a referral decision.
- No API, schema, or permission change. `referral.dashboard` already returns
  everything the new layout reads; the client groups students by referrer and
  reuses the pure `groupMoneyByCurrency` so the totals always match the rows
  actually on screen, including when removed students are hidden.

## Consequences

- Counts and money on a referrer card follow the removed-students toggle,
  because both are derived from the visible students. `referrerSummaries` from
  the API is unused by the web client; it stays on the procedure as data other
  callers may want, and is the reason no server change was needed.
- Filtering by plan or dues state is no longer possible on O9. Those questions
  belong to the Members and Payments screens, which already answer them.
- Assigning several referrals in a row costs one dialog open each, instead of
  editing rows in place. At the real rate of a few per month that is the
  cheaper trade for a page nobody has to learn.

## Alternatives rejected

- **Keep the ledger, hide the controls behind a row menu:** still one row per
  student, still student-first, and it hides the action instead of siting it.
- **A second "who referred them" field on the member detail drawer:** splits one
  rule across two screens and leaves O9 as the reporting toy it was.
- **Inline editing on the referrer card:** puts a rare write back into forty
  places, which is the thing this note undoes.

## Verification

- Typecheck and lint pass. Server behaviour, tests, and the audit trail are
  untouched, so ADR 52's coverage still holds.
- Manual checks remain: owner correction and clear, instructor initial
  assignment, the removed-students toggle, search across both sections, and the
  dialog at phone width.
