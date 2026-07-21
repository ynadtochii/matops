<!-- Transient handoff for the agent building the student mobile app. Delete once the mobile pass is underway. -->

# Mobile pass kickoff — the Expo student app (start here)

**You are a fresh agent picking up matops to build the mobile app.** Phases 0–2 shipped **web-first**; the whole Expo student UI was deferred to this one pass. This note orients you fast — it holds the **decisions already made** and points at the canonical docs. Read `CLAUDE.md` first (auto-loaded), then this.

## Where the project is

- **Phases 0–2 complete, web-first, green** (`pnpm lint typecheck test`; 54 tests). Identity join loop + scheduling core are built and **verified live on Neon**. As-built truth: `docs/architecture.md` §0. What shipped: `CHANGELOG.md`.
- **The Expo app is still the T3 scaffold** (a posts demo). But the foundations are wired: **expo-router**, **Better Auth** (magic-link + org + `expo-secure-store`), and the **tRPC client** (`apps/expo/src/utils/{auth.ts,api.tsx,base-url.ts}`). The routers it needs already exist and are callable today.
- **Uncommitted:** the Phase 1 + Phase 2 change set is likely still in the working tree — `git` was blocked in the prior session by the macOS Xcode license (`sudo xcodebuild -license`). Check `git status`; commit before/while you work (ask the user; repo rule is no auto-commit).

## What this pass is

The **student app** (spec §2, screens S1–S8). Covers roadmap **Mob** cells **1.3, 1.4, 1.6, 2.4**. Almost entirely RN UI + navigation + deep links — no new business logic; the API is done.

**Decisions locked (do not re-litigate):**

- **Deep links = custom scheme now.** `matops://join/<code>` + an in-app "paste invite link" path. **Universal/App links** (Apple App Site Association + Android assetlinks + EAS submit) are deferred to a **Phase 5 launch-infra** task — they need the user's Apple Developer + Google Play + EAS accounts and a hosted domain.
- **Rename the scheme `expo` → `matops`** in `apps/expo/app.config.ts` (name/slug/scheme) + the auth `expoClient` scheme; set real `ios.bundleIdentifier`/`android.package` (e.g. `com.matops.app`).
- **Booking is out (Phase 3).** No book/cancel (S5 button), no My Classes (S6), no QR check-in (S8), no push (Phase 4). **Class detail is read-only.**

## The slices (dependency order; each ends shippable — follow `docs/delivery.md` §4–5)

- **M0 — Shell + retire demo:** rename scheme + bundle ids; replace `app/index.tsx` with an **auth-gate** (no session → Sign in · session, no active academy → Join a gym · else → Schedule); delete `app/post/[id].tsx`; retire the scaffold `post` router + `Post`/`CreatePostSchema` + drop the `post` table (migration `0009`); a tiny NativeWind RN UI kit.
- **M1 — Sign in (S1):** magic-link screen; `callbackURL` deep-links back into the app.
- **M2 — Join + pending (S2/S3)** [Mob 1.3/1.4]: `app/join/[token].tsx` = RN twin of the web `JoinFlow` (`apps/nextjs/src/app/join/[token]/join-flow.tsx`) → `membership.join` → pending; wire the `matops://join/<code>` deep link + in-app paste; **pending banner (S3)** on the schedule.
- **M3 — Schedule + detail (S4/S5 read-only)** [Mob 2.4]: `class.mine({from,to})` grouped by day, "N spots left", empty state; read-only `app/class/[id].tsx` (add a small `class.get` enrolled procedure).
- **M4 — Profile + switcher (S7)** [Mob 1.6]: name/phone/current academy/sign out; switcher from `academy.listMineStudent` + `academy.setActive` (shown with 2+).
- **M5 — Docs + gates:** flip Mob cells 1.3/1.4/1.6/2.4 → `done`; CHANGELOG; architecture §0 mobile as-built + §6/§11; ADR **31** (deep-link approach: custom scheme now, universal deferred).

## Read before you build

- **Spec:** `docs/spec.md` §2 — **S1** (sign in), **S2** (join / deep link), **S3** (pending banner), **S4** (schedule home), **S5** (class detail — booking part is Phase 3), **S7** (profile + switcher). Cross-cutting: §4 (privacy — pending sees counts only; no names until Phase 3).
- **Roadmap:** `docs/roadmap.md` — the "Deferred: Phase 1 mobile pass" note (Phase 1 section) + slice 2.4 detail. The student-lens API gap is **closed** (`isStudentLensMembership`, `academy.listMineStudent`, `class.mine`).
- **Architecture:** §6 (auth flows — mobile magic-link + secure-store) + §11 (deep-link setup is the known non-trivial bit).

## Patterns already in place to reuse (don't reinvent)

- **API is done.** `invite.resolve` (public), `membership.join` (protected, → pending, activates first academy), `academy.current`/`listMineStudent`/`setActive`, `class.mine` (enrolled — pending may browse, RLS-scoped to the caller's active academy so a student only sees their own gym). Add only a small `class.get` (enrolled, by id) for the detail screen.
- **Auth + tRPC wired.** `authClient.useSession()` / `signIn.magicLink` / `signOut`; `trpc.*.queryOptions()/mutationOptions()` via `~/utils/api`. Cookies are attached from secure-store automatically.
- **Web twins to mirror:** the join flow (`join-flow.tsx`), roster/dashboard patterns (`apps/nextjs/src/app/_components/*`) show the exact tRPC call + optimistic + toast shape. NativeWind class names match the web tokens (`bg-background`, `text-foreground`, `bg-muted`, `text-primary`, `text-destructive`, `text-muted-foreground`).
- **Client is the lens** (`docs/issues/18`): mobile lists **student-lens** academies; web lists owner/instructor. Same login can be owner at one gym, student at another.

## Two hard constraints

1. **You cannot run a simulator/device in this environment.** Verify with the static gates (`pnpm -F @matops/expo typecheck lint format`) + code review; hand the user a **device-test checklist** (`pnpm -F @matops/expo dev`). In dev the magic link **prints to the Next.js console** (email is Phase 4) — the user copies it.
2. **Custom-scheme deep links need a dev build** (`expo run:ios`/`run:android` or an EAS dev build), **not Expo Go** (Expo Go owns its own scheme). The in-app "paste invite link" path works everywhere — lead with that for testing.

**Then delete this file** — the canonical docs (spec/architecture/roadmap/CHANGELOG) carry it from here.
