# Desk check-in tablet: implementation plan

ADR: [150](issues/150-desk-check-in-tablet.md). Goal: an owner or manager opens a secret link on a tablet at the desk, and students tap their name to be marked present for the class. The page reaches nothing else in the app.

## Steps

- [x] **D1. Domain rules** (`packages/domain/src/desk.ts`, test in `packages/domain/test/desk.test.ts`).
  - `deskWindow(now, tz)`: the rows to fetch, local midnight to midnight (earlier for a long class still running).
  - `deskClasses(classes, now)`: today's classes that have not ended, soonest first, each with `open` (`canCheckIn`).
  - `deskDefaultClass(classes)`: the one open class; null when two are open; else the next class today.
  - `deskNames(members)`: "Ana S."; full names when two short names clash.
  - `deskSearch(members, query)`: word-start match, ignoring case and accents, 2 letters minimum, 10 results.
  - `canUndoDeskCheckIn(row, now)`: source `reception_self`, `markedBy` null, present, under 30 seconds old.
- [x] **D2. Database** (`packages/db`).
  - `desk_link` in `drop-in-link-schema.ts`, built from the same column set as `drop_in_link`.
  - Link helpers shared by both tables (`live-link.ts`): get, get or create, rotate. `resolveDeskLink` in `desk.ts`.
  - Migration `0010_desk_link` (structure only; check `when` in `_journal.json`).
  - Seed teardown and `wipe-academies.sql` delete `desk_link` rows.
- [x] **D3. API** (`packages/api`).
  - `checkInMember` takes an optional `source`.
  - `deskProcedure` in `trpc.ts`: public, takes `token`, resolves the academy on the base connection, then runs the tenant transaction.
  - `router/desk.ts`: `link` and `rotateLink` (owner or manager), `classes`, `roster`, `search`, `checkIn`, `undo` (token).
  - Rate limits per token in `rate_limit`.
- [x] **D4. Web** (`apps/nextjs`).
  - `app/desk/[token]/page.tsx`: class header and switcher, name buttons, search, success with undo, refresh every 60 seconds. `noindex`, `no-referrer`.
  - Settings card "Front desk tablet": copy, open, QR, rotate with confirm.
- [x] **D5. Tests** (written, not run): `packages/api/test/desk.test.ts`, `packages/db/test` link helpers.
- [x] **D6. Docs**: spec rule next to S8, `docs/architecture.md` §5 exception list, `docs/roadmap.md`, `CHANGELOG.md`, ADR 150 status.

## Acceptance criteria

- Owner or manager gets the link; instructor and student calls to `desk.link` and `desk.rotateLink` are refused.
- Tap class, tap name: the student is `present`, booked if they were not, and Attendance shows it.
- After rotate, the old token fails on every call and the new one works. Unknown and revoked tokens get the same answer.
- No data from another academy, and no contact or health fields, ever leave a desk procedure.
- Pending or suspended member refused. A second tap is a no-op.
- Undo works only within 30 seconds and only on a desk check-in; it removes a booking the tap created.

## Progress log

- 2026-10-13: Plan and ADR 150 written. Work on `dev`.
- 2026-10-13: D1 to D6 built. `drop_in_link` and `desk_link` come from one table builder; `drizzle-kit generate` produced only `desk_link`, so the drop-in table did not change. The link helpers moved to `packages/db/src/live-link.ts`. The search schema carries `classId` directly. The db-level link tests stay in `packages/db/test/dropin.test.ts` (shared code); desk behavior is covered in `packages/api/test/desk.test.ts`. Lint and typecheck pass; tests written, not run. Open: browser check on a real tablet, pilot at one busy class.
- 2026-10-13: `0010` applied to dev (`verify`: `desk_link` base-only; ledger count 17 of 11, from older branch rows). HTTP smoke on localhost: unknown token gives 404 with the link message; the page sends `noindex` and `no-referrer`. Browser check blocked by the Chrome extension.
- 2026-10-13: When no class is left today, the desk shows tomorrow's classes (`deskClasses` returns `tomorrow`; `deskWindow` reaches the end of tomorrow).
- 2026-10-13: Desk open rule: the first class (by start time) is open all day until it ends; when it starts the next one opens. `deskClasses` returns `open` and `opensAt`; `desk.checkIn` checks the same list and calls `checkInMember` with `checkWindow: false`.
