# Expo app: align with the student web (plan)

Status: built on `dev`, 2026-10-19, except photos (the academy icon, avatars and F9 upload wait for ADR 152 file storage to reach `dev`) and E5. Decisions 1 to 4 were taken as recommended. Typecheck, lint and format pass; nothing was run on a device after the change.

The Expo app is for students only. There is no staff app, and this plan does not add one. The goal: a student sees the same information, can do the same things, and sees the same design in the app as on the web, on a phone. The reference is the student web at phone width (the mobile top bar and bottom tabs in `app-shell.tsx` and `shell-frame.tsx`).

Expo has not changed since 2026-09-29 (ADR 147). Every mobile change since v1.8 passed typecheck and lint only. Nobody has run the app on a device.

## Gap summary

Web student screens and their Expo twins:

| Web | Expo | Gap |
| --- | --- | --- |
| `/` `student-screen.tsx` | `(tabs)/schedule.tsx` | Different layout. No drop-in share. Wrong pending copy. |
| `/training` `my-classes-screen.tsx` | `(tabs)/training.tsx` | Different layout (web: Upcoming and Attended tabs). |
| `/class/[id]` `class-detail.tsx` | `class/[id].tsx` | No status card, no "Who's booked", no drop-in share. |
| `/profile` `profile-screen.tsx` | `(tabs)/profile.tsx` and `settings.tsx` | No photo, no email opt-in, no erasure request, no Feedback and Privacy links, rank history cut to 5. |
| `/payments` (payment flag) | dues inline on Profile | Expo reads dues without checking the flag. |
| `join/[token]` | `join/[token].tsx`, `onboarding.tsx` | No academy icon. No Google (known native problem). |
| none | `notifications.tsx`, bell | Expo only. Keep. |

Bugs found (Expo is wrong today):

1. A pending student sees "You can browse and book" (`apps/expo/src/app/(tabs)/schedule.tsx:270`), and `book-control.tsx:51` skips the gate while pending. The server refuses (`packages/api/src/payments-gate.ts:43`), so the student taps Book and gets an error.
2. Profile calls `accessPlan.mine` without checking `membershipEnforced` (`(tabs)/profile.tsx:166,239`). The web hides payment while the flag is off.
3. The invalid-invite button says "Enter a gym ID", but the text above it says "6-digit join code" (`join/[token].tsx:82`).

Design gaps:

- **Shapes.** Expo uses pill buttons and pills for status, with 12px cards. Web uses 5px controls, 8px cards and lists, and 4px badges.
- **Tokens.** `packages/ui/src/tokens.ts` is a hand-synced copy of `apps/nextjs/src/app/theme.css`. The colors match. It is missing `card-edge`, `ring-halo`, shadows, edge gradients and the meter fill. So Expo cards have no lift and no lit edge.
- **Icons.** Web uses Lucide. Expo uses icons drawn by hand with Views (`components/icons.tsx`). The Training tab icon differs (bar chart vs CalendarCheck).
- **Badges and type.** "Booked" is an info-blue pill in Expo and a neutral badge with a check on the web. Expo shows times in Geist Mono. The web uses Inter with tabular numbers.
- **Header.** The web phone top bar has the academy icon and the user's avatar. Expo has the mark, the academy name and the bell.
- **Brand leftovers.** The Android icon background is violet `#1F104A` (`apps/expo/app.config.ts`). It conflicts with the monochrome rule.

## Decisions to make first

1. **How close to the web?** Recommended: same information, same components and same words. Keep native behavior where users expect it: the share sheet, pull to refresh, native alerts for "Book anyway?". Keep the larger phone type scale from ADR 141 step 5 (15px body). The web is already 44px touch height at phone width.
2. **Drop-in sharing in the app.** ADR 147's addendum says web only "for now". Recommended: add it. React Native's built-in `Share` needs no native module. Needs an ADR 147 addendum.
3. **Cancel confirm.** The web cancels with no confirm and Expo asks first. Recommended: follow the web, because the student can book again.
4. **Payment on Expo.** Payment is off and no screen turns it on. Recommended: fix the flag check only (bug 2). Leave a Membership tab for whenever payment comes back.
5. **Native build.** Photo upload (`expo-image-picker`, `expo-image-manipulator`) and Lucide (`react-native-svg`) need a new dev client. iOS waits on the Apple developer account. Recommended: do every JS-only step first. Then put all native changes into one build, Android first.
6. **Google sign-in on mobile.** It needs the native ID-token flow (`docs/mobile-google-login-handoff.md`). Recommended: keep it out of this plan as its own slice.

## Steps

Each step keeps the Definition of Done: spec, roadmap row and CHANGELOG line in the same change. Lint and typecheck: `pnpm -F @matops/expo typecheck lint format`.

- [x] **E0. Device baseline (human).** `pnpm dev:ios`, then walk `docs/mobile-device-test.md`. Write down what breaks. This step comes first, because nobody has seen the Linear restyle on a phone, and later steps build on it. Fix crashes here, before any redesign.

- [x] **E1. Bug fixes (JS only).**
  - Pending student: the banner says booking opens after approval. The Book button is locked with `accessReason("pending-approval")`, same as `apps/nextjs/src/app/_components/use-booking.ts:38`.
  - Show a locked booking before the tap (inline callout), not as a toast after it.
  - Run `accessPlan.mine` only when `academy.current.membershipEnforced` is true.
  - Invalid-invite copy: one name for the join code.
  - Remove stale comments: the stats card (`training.tsx:107`, `suspended-notice.tsx:8`), the branch switcher (`profile.tsx:401,510`), NativeWind (`theme.tsx:60`), violet (`ui.tsx:34`), "Nobody" (`class/[id].tsx:152`), and the old mobile pointer in `theme.css:12-13`.
  - Delete the unused kit pieces `Stat`, `OrDivider`, `SectionHeading` and `CountBadge` in `ui.tsx`.

- [x] **E2. Missing student features (JS only, no API change).** Photos are not done: they need ADR 152 on `dev`. Every procedure already exists.
  - Profile: email updates opt-in (`membership.emailUpdates`, `membership.setEmailUpdates`).
  - Profile: ask to erase my data, and withdraw the request (`membership.erasureRequest`, `requestErasure`, `withdrawErasureRequest`). Same wording as web (ADR 145).
  - Profile: "Joined Mon YYYY", the full rank history with the shared date format, the rank empty state "Only a coach can set it", and Feedback and Privacy links.
  - Class detail: the status card ("You're booked", "Booking closed", "Waiting for approval"), Instructor "Not assigned yet", and "Who's booked" (`class.attendees`, names hidden while pending).
  - Show photos (display only, RN `Image`, no native module): the academy icon in the header and on join, the avatar in the header and on Profile, and photos in "Who's booked" if the web shows them there.
  - Drop-in share (if decision 2 is yes): a share action on each schedule row and on class detail, through `dropIn.link` and RN `Share`.

- [x] **E3. Redesign (JS only).** Follow the web student screens at phone width.
  - Tokens: add the missing tokens to `packages/ui/src/tokens.ts` (`card-edge`, `ring-halo`, shadow, meter fill). Fix the `theme.css` header comment so it names `tokens.ts` as the mobile copy.
  - Primitives in `components/ui.tsx`: radius 5, 8 and 4 to match the web. Buttons stop being pills and get the web variants (primary, secondary with a lit edge, outline, ghost, destructive). Cards get the lit edge and shadow. `StatusPill` becomes the web `Badge` (neutral "Booked" with a check). Add a `Meter`.
  - Times use Inter with tabular numbers (`fontVariant: ["tabular-nums"]`), not Mono.
  - Header: academy icon, academy name, bell, avatar (links to Profile).
  - Schedule: the web layout. Featured day cards (big time, "Starts in…" via `startsInLabel`, Meter, full-width Book), a row of day chips with counts and a booked dot, day sections with "Earlier today (n)" folded. Discipline as a dot, like the web.
  - My classes: Upcoming and Attended tabs with counts, the "Next class" badge, the empty state with "Find a class".
  - Class detail and Profile: the web section order and words.
  - Copy pass: subtitles, empty states and the sign-in heading match the web.
  - One minute clock, like the web `useMinuteClock`, so "Starts in" and past classes update.
  - Move date helpers that both apps repeat (`apps/expo/src/utils/format.ts` and `apps/nextjs/src/lib/format`) into `@matops/domain` when the code is the same. Only move what is really shared.

- [ ] **E4. Native build (one batch).** Done: Lucide icons and the black Android icon background. Left: F9 photo upload, and a new dev client build to try them.
  - F9 photo upload: `expo-image-picker`, `expo-image-manipulator` (resize to 512, re-encode, removes EXIF), upload through `storage.createUpload` and `completeUpload`, remove through `storage.removeAvatar`. ADR 152 and `docs/file-storage-plan.md` F9.
  - Icons: `react-native-svg` and `lucide-react-native`. Replace `components/icons.tsx` with the same icons the web uses.
  - Monochrome splash and Android adaptive icon background.
  - Build the Android dev client, then walk E0's checklist again. iOS follows when the Apple account exists.

- [ ] **E5. Release and cleanup.**
  - EAS production build and store submit.
  - After the three-tab build is live and old builds have aged out, remove the `checkin` router (CLAUDE.md, overlap period).
  - Docs: spec rows for S4 to S7 say the same thing for web and app; roadmap Mobile cells; CHANGELOG; ADR 147 addendum (if decision 2 is yes); ADR 141 addendum for the shape change in E3.

## Out of scope

- A staff app (dashboard, schedule editing, students, attendance, desk).
- Google sign-in on mobile (own slice, decision 6).
- Universal links and App Links (Phase 5).
- Receipts (F10, behind the payment flag).
- Training stats. Neither the web nor the app has them now.

## Tests

Never run in a session. After each step, the user runs:

- `pnpm -F @matops/domain test` (if E3 moves helpers into domain)
- `pnpm -F @matops/api test` (no API change is planned; run it if one appears)

Expo has no test suite. The checks are typecheck, lint, and the device checklist.
