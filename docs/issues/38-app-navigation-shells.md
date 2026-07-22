# 38 · App navigation shells — web sidebar + mobile tabs

*(v1.1 usability map, tickets [02](../../.scratch/usable-v1/issues/02-web-ia-app-shell.md) + [05](../../.scratch/usable-v1/issues/05-mobile-structure.md). Builds on [brand identity](37-brand-identity.md); refines [cross-platform UI](32-cross-platform-ui.md) + [mobile explicit styles](36-mobile-ui-explicit-styles.md).)*

## Context

Both apps had all their screens built but **no navigation shell**. The owner web app was a single scrolling page (`_components/dashboard.tsx`) that stacked Schedule, Attendance, Templates, Invites, Roster and Settings at once. The Expo student app was a flat Stack with header-link navigation. Neither read as a real, navigable app — the core "make it usable" gap.

## Decision

Give each app a proper shell, MAT-inspired, scoped to v1.

### Web — routed sidebar shell
- A Next App Router **route group `(app)/`** with a shared **`AppShell`**: a desktop **sidebar** + a **mobile bottom-tab bar** from one role-aware nav config; matops `Logo` on top, academy switcher, and the user + sign-out in the footer. Active item = violet left-rail + `bg-brand-wash`.
- **Five routed screens:** Dashboard (`/`), Schedule (`/schedule`, with a Templates sub-tab), Roster (`/roster`), Attendance (`/attendance`), Settings (`/settings`). Public routes (`/checkin`, `/join`) and `/sign-in` stay outside the shell.
- **Layout gate:** `(app)/layout.tsx` redirects unauthenticated users to `/sign-in`; the client `AppShell` resolves the active academy → onboarding (no chrome) or the shell.
- **Role split:** owner sees all five; **instructor sees Dashboard, Schedule, Attendance only** — no Roster, no Settings. This settles a `spec.md` §3 contradiction (roles table said "see the roster"; the screen list said "O1–O3, O5"). Nav hiding is convenience; the server `ownerProcedure`/`staffProcedure` guards remain the real access control.
- **New:** the O1 **dashboard** (command center — triage cards, KPI stats, today's classes, quick actions) and the venue **QR poster** (`qrcode.react`, ticket 08).

### Mobile — tab bar
- An expo-router **`(tabs)/` group** with three tabs covering the core loop: **Schedule** (S4, home) · **Check in** (S8) · **Profile** (S7). Class detail (S5) and the pre-join stack (sign-in, join) push over the tabs from the root Stack. Active tint = brand; icons are simple monochrome Views (no icon-font dependency); screens own their headings so the tab header is hidden.

### Brand + native styling
- The mobile UI kit gained the **brand tokens** + a **`Mark`/`Logo`** (basketweave via positioned Views) + a **brand Banner tone** (the S3 pending banner). The home, check-in, class-detail, onboarding and sign-in screens were **ported from NativeWind classes to explicit RN styles** (per ADR 36, which found spacing/alignment/foreground-colour utilities don't translate on native), with restrained violet accents (booked pill, active switcher, pending).

## Consequences

- Both apps now navigate like real products; every existing screen kept its logic and data, only its container changed.
- Verified by the static gates (typecheck, lint, `next build` — all routes present) + the PGlite/domain tests. **Device/simulator visual verification is still pending** (no simulator in this env — the project's standing handoff pattern).
- Follow-ups: deeper per-row visual polish on the web screens; the mobile wordmark colour follows OS scheme until the kit's theme hook drives it (ADR 37); quick-schedule power tools (spec A3) deferred.
