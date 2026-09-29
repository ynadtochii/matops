# 147 · Drop-in link: one public token per academy for booking and attendance

**Status:** accepted (slices built) · **Date:** 2026-09-28 · **Area:** `packages/db` (`drop-in-link-schema.ts`, migration `0009_drop_in_link`), `packages/api` (`router/dropin.ts`, `rate-limit.ts`), `packages/domain` (`dropin.ts`, `signup.ts`, `checkin.ts`), `packages/validators` (`checkin.ts`, `fields.ts`, `booking.ts`), `apps/nextjs` (`drop-in/`, `invite-link-card.tsx`, `class-roster.tsx`, `members-screen.tsx`, `leads.tsx`) · **Supersedes in part:** [24](24-qr-self-checkin.md) (the public `/checkin/<academyId>` wall-QR form and Expo Scan tab are removed), [118](118-the-owner-makes-the-account.md) §5 (the lead promotion feature `dropIn.promote` is removed) · **Plan:** [drop-in-booking-plan.md](../drop-in-booking-plan.md)

## Context

The public wall-QR form at `/checkin/<academyId>` captured drop-in leads and let them book a live class or attend one now. The Expo app had a Scan tab for member QR check-in. The owner could convert a lead to a member through "Make them a member". These paths are replaced by one shared link per academy that both staff and visitors use.

## Decision

One **public, rotatable drop-in link per academy**, at `/drop-in/<token>`. Any staff member can copy and share it, and the first read creates it. Only owners and managers rotate it. Visitors use the same form to book classes and see the gymnasium's staff. No camera or QR scanner is needed.

1. **The link.** `drop_in_link` holds one live token per academy (a random opaque string, unique, with a `revokedAt` timestamp). Any staff member who reads `dropIn.link` gets the live token, and the first read creates it, so an instructor never waits for an owner. Two reads at once still give one token (insert on conflict do nothing, then read again). `dropIn.rotateLink` revokes the old token and writes a new one; only owners and managers may rotate. Rotating is the only write that can break links already sent to people. `dropIn.resolve` takes a token from the browser, resolves the academy server-side before any other query, and returns the academy name. All token queries bypass RLS (like `academy_invite`) because the academy is not known until the token is resolved.

2. **The visitor form.** `/drop-in/<token>` is a public page. Visiting it shows the academy name. Email and phone come first (required). After both fields lose focus or Continue is pressed, the server looks for one lead in that academy where both values match and returns only the first name, or the same generic "no match" for every mismatch (one-field match, no match, or a lead with missing email, absent consent, missing required answers, or an outdated agreement). The visitor confirms "Are you {name}?" to skip the full form, or No or no match opens the full form. The server rechecks both values on submit and does not overwrite a lead's profile.

3. **What the visitor chooses.** The form shows only class title, local date and time. Classes running now (within 10 minutes of current time) and scheduled classes within seven local days are offered. The visitor picks one. Picking a class on now marks the visitor present (` present` on `drop_in_visit`). Picking a future class books them (`booked` on `drop_in_visit`, `unmarked` on `class_participation`). No class means no submission. Soft capacity never refuses a visitor booking.

4. **New visitor first form.** When first-time or no-match, the visitor answers the academy's current questions: **belt and stripes** (required, same choices as student join; "Never trained" saves White 0 plus a note, "Enquiring for a child" saves no rank plus a note), optional **injuries and medical conditions** when the academy asks it (bounded to 1000 chars; staff-only; removed by the existing erase), **"Keep me updated on changes"** (unticked by default), and the current **required agreement** when it is on, with a required **"I have read and agree"** tick. The same field components and validation (`checkSignupAnswers` in `packages/domain/src/signup.ts`) are shared with student invite join, but the answers stay on `drop_in`, never copied to a membership. A visitor who returns with a good match and an up-to-date agreement answer does not fill the full form again.

5. **Staff see the visitor's level.** The class roster shows belt and stripes for each booked visitor. Staff can see the health note when the visit is not cancelled (visible to staff at that academy on the class the visitor booked). The owner lead list shows belt, stripes, health note, news opt-in choice and agreement acceptance date for each lead.

6. **Rate limiting.** Lookups and submits are rate-limited by a Postgres fixed-window counter (`rate_limit` table, `takeRateLimit`), keyed by a SHA-256 hash of caller IP, scope and link token: 10 tries per 10 minutes per token. Rejected lookups, invalid links and refused submits are logged with `console.warn` without contact data. The counter is persisted, not per-process, because a public form with per-process limits can be exhausted by trying different tokens on the same IP.

7. **Removed.** The public `/checkin/<academyId>` form and the Expo Scan tab. Both QR check-in procedures (`checkin.today`, `checkin.checkIn`) are **kept** for an overlap period so old mobile builds do not break on sign-in; they are removed in a later deploy after the three-tab Expo build (without Scan, without the `checkin/[academyId]` deep link) is released. The "Make them a member" action on the leads screen and the `dropIn.promote` procedure are removed. The Expo `scan.tsx` tab and the `checkin/[academyId]` screen and deep link are gone. The server `checkin` router (`checkin.today`, `checkin.checkIn`) is **kept**.

8. **Rollout.** Printed check-in posters and old mobile Scan builds stop working after this deploy because the `/checkin/<academyId>` form is gone. Production has zero academies today, so the impact is on dev and test gyms only. Old mobile builds also cannot join an academy by code or invite as a student, because the server now requires a belt answer. The overlap period covers the time needed for the new three-tab Expo build to release and be adopted.

## Consequences

- A visitor gets a class with no account. One link prints on a poster or sends over text.
- The owner or manager controls the link and can rotate it if it spreads too wide.
- An instructor can print or share the link; staff never see the full leads list.
- A returning visitor's first name appears as confirmation only if both contact values match a lead.
- Student join (`membership.joinByCode`) now requires a belt answer, the same as invite join. Guests must answer to book.
- `drop_in` now holds questions the visitor answered and their agreement acceptance, separate from any membership. Erasing a gym erases these rows.
- The visitor can opt in to news, but news sending is not built (ADR 146 reserves the field).

## What is not in this slice

- Bulk convert visitors to members (leads stay leads).
- Affiliate or referral tracking from a drop-in visit.
- Visitor event emails (approval, booking confirmation).
- Automatic link expiry (rotate when needed).
- Offline or cached submission.
- Camera or barcode scanning (one link is human-readable).

## Database

Migration `0009_drop_in_link` adds:

- `drop_in_link` (id, academyId, token, createdBy, createdAt, revokedAt): one live row per academy (unique index on academyId where revokedAt is null). No RLS, no grant to matops_app.
- `rate_limit` (key, count, resetAt): fixed-window counter. No RLS, no grant to matops_app.
- `drop_in` columns: `belt` (text), `stripes` (integer), `health` (text bounded to 1000 chars), `email_updates_at` (timestamp), `waiver_id` (uuid, composite FK to academy_waiver), `waiver_accepted_at` (timestamp).

Seed teardown and `wipe-academies.sql` delete drop_in_link rows. Drop-in answers are erased with the drop_in row.
