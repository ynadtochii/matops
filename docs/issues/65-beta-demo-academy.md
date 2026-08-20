# 65 — One demo academy for the beta test ("Alma beta")

**Status:** accepted · **Date:** 2026-08-20 · **Area:** `@matops/db` dev tooling
· **Supersedes the two-academy part of** [51](51-db-seed-module.md)

## Context

We are running a web-only beta with an outside tester. The database held five
academies: three real scratch gyms from development, plus the two fake ones
[51](51-db-seed-module.md) builds ("Ironside BJJ Academy" and "Northside
Grappling Club"). A tester who sees a gym picker, or lands in a half-built
scratch academy, is testing our leftovers instead of the product.

The mobile app is out of scope for this beta. The second academy existed only so
the real user could be a **student** somewhere (the Expo screens), so it now
costs data noise and buys nothing.

## Decision

**One seed academy, named "Alma beta".** `SEED_ACADEMIES` (a map of two) becomes
`SEED_ACADEMY` (one row): id `seed_org_alma`, code `990001`, Europe/Kyiv, EUR.
`seedAcademyList` / `seedAcademyIds` stay as lists, so teardown, status, and the
IO layer keep working unchanged over one element.

**You own it, the tester joins as an instructor** through the seeded
`seedtoken_alma_instructor` invite link. The seed still attaches to your real
`user` row by email and never creates or deletes it (the rule from 51 holds).

**Every other academy is deleted, once, by hand.**
`packages/db/src/seed/wipe-academies.sql` clears every tenant table, every
membership, every organization, and the `seed_` users, keeping real `user` rows.
It also drops all sessions, because a session pins an `activeOrganizationId`
that is about to disappear. It is a one-off script, not a command: after the
beta there is nothing left to wipe, and `seed reset` covers the demo academy.

**The dataset covers more states**, so the tester meets the whole product
without us staging anything live:

- All four **drift bands** (`active` / `cooling` / `at_risk` / `dormant`), from
  four students who stopped training 10, 18, and 32 days ago plus one who never
  trained. The past-class window grows from 28 to **42 days**, so a dormant
  member still shows history instead of looking like a never-joiner. `run.ts`
  keeps these students out of future bookings — a booking tomorrow would
  contradict the band.
- A **one-off class** in the past (with attendance) and one upcoming, both with
  `template_id` null, plus a **cancelled past class**, which also gives the O10
  coach card a non-zero "cancelled" count.
- All five **disciplines** on the weekly board (bjj / nogi / judo / mma / other),
  so every colour on the grid and the poster is exercised.
- An **archived plan** (soft-deleted) that one member is still on — the O7
  "· archived" option.
- A **third coach who has taught nothing**, proving the roster shows zeros
  rather than dropping the card, and **black belts for all three coaches**, so a
  staff member's detail is not blank.
- Two more **drop-in leads**: one tied to a class (it shows on that class's O5
  roster) and one who did not consent to contact.
- All three **referral audit actions**: `assigned`, `corrected`, and `cleared`
  (the retained row with a null referrer).
- **Five staff notes**, two of them on the same member, so the note thread reads
  as a timeline.

## Consequences

- `seed up` no longer gives the real user a **student** membership anywhere, so
  the mobile student screens have no demo data until a second academy comes
  back. Acceptable: this beta is web-only.
- The academy id changed (`seed_org_alpha` → `seed_org_alma`), so any rows left
  under the old id are orphans to teardown. The wipe script removes them, which
  is why it runs before the first seed.
- `seed fill <code>` / `clear <code>` are untouched: they work on a real
  academy and never knew about the demo ones.
