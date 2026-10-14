# 150 · Desk check-in tablet: one secret link per academy

**Status:** accepted, built (tests written, not run; `0010` not applied) · **Date:** 2026-10-13 · **Area:** `packages/db` (`drop-in-link-schema.ts`, `desk.ts`, migration `0010_desk_link`), `packages/api` (`router/desk.ts`, `member-checkin.ts`, `trpc.ts`), `packages/domain` (`desk.ts`), `apps/nextjs` (`desk/[token]`, the Settings card) · **Builds on:** [147](147-drop-in-link-booking.md) (the link pattern), [139](139-reception-permanent-link.md) (the earlier reception design, removed by [142](142-first-release-approval-only-booking.md)) · **Plan:** [desk-checkin-plan.md](../desk-checkin-plan.md)

## Context

ADR 139 built a reception screen for a tablet at the door. ADR 142 removed it for the first release. Today a student who arrives can only be marked present by a staff member in Attendance. The academy wants a tablet at the desk where students mark themselves present, without a staff account signed in on it.

## Decision

1. **One secret link per academy.** An owner or manager gets `/desk/<token>` from Settings. The token is random (the same generator as the drop-in link) and cannot be guessed. `desk_link` keeps one live row per academy, the same shape as `drop_in_link`. The token is stored as plain text so the owner can copy it again. Instructors never see it.
2. **Rotate.** Rotating revokes the live token and writes a new one. Every desk request resolves the token again, so an old tablet gets "This link was replaced" on its next call. An unknown and a revoked token get the same answer.
3. **One page, one job.** The page lives outside the app shell and has no links. Its procedures are public: they read the academy only from the token, never from the session or `x-matops-entity`. After the token resolves, the request runs in the normal tenant transaction (`withScope`), so row-level security still applies. The page sends `noindex` and `Referrer-Policy: no-referrer`.
4. **Class first, then name.** The page opens on the class running now, or else the next class today. If two classes are open for check-in at once, it asks which. A switcher lists today's classes that have not ended. When none is left today, it lists tomorrow's classes instead (in the academy's time zone), so the next class is visible the evening before; they open only on their own day. Check-in follows the list, not the 60-minute window: the first class (or classes starting together) is open at any time today until it ends, and once it starts the next class opens too. That lets latecomers and early arrivals both check in. A later class shows when it opens (the start of the class before it). Tomorrow's classes never open early. The server checks the same rule (`deskClasses`) and calls `checkInMember` with `checkWindow: false`.
5. **Check-in only.** Tapping a name marks the student present and books them if they had no booking, through the existing `checkInMember`. The tablet never books a future class.
6. **Any active member.** Booked students show as name buttons; a search (2 letters or more, at most 10 results) finds every other active member as a walk-in. A pending, suspended or archived member is refused with "Please talk to the desk".
7. **Short names.** The tablet shows first name and last initial. When two members would show the same short name, both show their full name. No email, phone, health note or status leaves the server.
8. **10-second undo.** The success screen offers "Not you? Undo" for 10 seconds. The server accepts an undo only for a row in the token's academy, with source `reception_self`, marked present less than 30 seconds ago and not touched by staff since. Undo sets attendance back to `unmarked`, and cancels the booking too when the tap created it.
9. **Source.** Desk check-ins write `check_in_source = 'reception_self'`, a value the existing check constraint allows, with `coalesce` so the first recorded source is kept.
10. **Rate limits.** Per token in the shared `rate_limit` table, not only per IP, because a tablet shares the gym's WiFi address with visitors.

## Consequences

- A gym can run check-in at the door with no staff account on the device.
- Whoever holds the link can mark any active member present at a class open for check-in and see short names. The owner rotates the link if it spreads.
- Staff still correct attendance in the Attendance screen; the desk adds no new attendance rule.

## Not in this slice

Booking from the tablet, drop-in visitors at the tablet (the drop-in link covers them), a source label in the staff roster, offline mode, automatic expiry, the Expo app.

## Database

Migration `0010_desk_link` adds `desk_link` (id, academyId, token, createdBy, createdAt, revokedAt), with one live row per academy (unique index on academyId where revokedAt is null). No RLS and no grant to `matops_app`, like `drop_in_link`. Structure only.
