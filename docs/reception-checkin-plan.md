# Reception iPad: class check-in

Superseded design: see [the two-flow technical implementation plan](reception-implementation-plan.md). This file describes the earlier daily-session implementation, not the newly requested permanent-link and staff-reception design.

Status: implemented locally. Lint and typecheck pass. Focused tests are written but not run. Real iPad verification and the gym pilot remain pending.

## Goal and confirmed scope

An owner leaves an iPad at reception. Members find their name and check into a class without signing in. Walk-ins enter their details themselves or with staff help.

Confirmed: this records class attendance, not arrival at the building.

The owner sets up the device. Members and visitors use it. Staff handle exceptions and correct mistakes in the existing attendance screen.

## Recommended experience

The screen shows the gym name, current class, a large “Find your name” search field, and “First time here?” below it.

1. Show classes within the existing check-in window: 60 minutes before start until class end.
2. Select the class automatically when exactly one is available. Keep its title and time visible.
3. When several classes are available, ask the person to choose before searching. Never guess between overlapping classes.
4. The member types part of their first or last name. Show up to five matching names after two characters, without a Search button.
5. Each result is a large button: “Check in Alex Silva”. Tapping it records attendance for the visible class.
6. Show “You’re checked in” and the class name only after the server confirms the write.
7. Clear the person’s details after three seconds. Offer “Next person” immediately. Return to the initial screen, including a fresh class choice when several remain available.

Autocomplete means live name suggestions. Do not select or submit the first result automatically. Match case and accents without requiring exact spelling. Ignore old search responses after the query changes. Do not download the whole member list to the browser.

If names are identical, require staff help in the first version. Do not expose phone numbers, emails, balances, or member notes to distinguish them.

Use large touch targets of at least 48 CSS pixels, clear labels, visible focus, and status text announced to assistive technology. Support portrait and landscape with the iPad keyboard open. Verify keyboard behavior on a real iPad rather than relying on automatic focus.

## Walk-ins

Confirmed: reuse the existing walk-in form and lead workflow. Walk-ins enter their usual details themselves or with staff help. The submission appears in Walk-in leads, where the owner follows up using existing actions.

- “First time here?” opens the existing walk-in form. Keep it available even when no member class is open for check-in.
- Keep the current fields and validation: first name, last name, phone, email, contact consent, and the form’s training-risk acknowledgement.
- Reuse the current class choices and server behavior. This feature does not redesign visitor booking or attendance rules.
- Reuse existing lead creation, phone matching, stages, and owner follow-up. Do not create a separate reception lead list.
- Staff may help type. The visitor provides their own acknowledgements.
- Keep the existing success outcome, then clear the form for the next person. Do not require an immediate staff approval step.
- Returning visitors use the same form. Do not expose the visitor directory through name search.
- No payment collection, new notifications, or new visitor registration schema.

For members, no available class means “No class is open for check-in. Please ask reception.” Walk-in lead capture remains available through the existing form.

## Shared-device access

Create a dedicated reception page outside the management shell. An owner or authorized manager activates it for one branch.

Use a restricted, revocable device session. It may only read permitted class choices, search eligible members, submit member check-ins, and submit the existing walk-in form for that branch. Derive branch scope from that session, not a caller-supplied branch identifier.

Activation ends this browser’s management session before setting the reception cookie. A full navigation starts the reception page with an empty client cache.

Leaving reception mode requires staff authentication. A concealed button or client-side PIN does not protect owner APIs. Recommend expiry at the end of the gym’s local day, with explicit renewal by staff. Allow revocation from another signed-in device.

Show only matching member names. Name search is still visible to people at reception, and a person can select someone else. This is a trust-based attendance flow, not identity verification. The requested search-and-tap flow accepts this tradeoff.

Clear search, selected person, form values, errors, and cached results after completion. Reset abandoned forms after 60 seconds of inactivity, with a warning and “Keep going” before clearing. Clear personal data when the page resumes from the background. Disable form persistence and request no browser autofill for visitor details. Verify actual Safari behavior.

## Rules and failure states

- Recheck class status, time window, branch access, membership state, and capacity on submission.
- Member policy: keep the existing member self-check-in payment and access rules. Staff can resolve exceptions separately. Never inherit a staff override through the kiosk.
- Show a neutral “Please ask reception” for restricted members. Keep financial and account details off the shared screen.
- A repeated tap or retry returns success for an existing attendance record without consuming another place.
- If a class fills, is cancelled, or ends during entry, explain that check-in is unavailable and refresh class choices.
- A connection failure preserves current input for retry until the inactivity reset. Do not show success before confirmation or queue offline attendance.
- Rate-limit by device and branch with limits suitable for an arrival queue. The public visitor limit is too low for a shared iPad. Bound searches and writes separately.
- Staff corrections remain in the existing attendance workflow. Do not add a public undo action that could change another person’s attendance.

## Existing code and proposed changes

| Existing area                                                 | Finding and planned use                                                                                                                                     |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/domain/src/checkin.ts:10`                           | Reuse the existing check-in window and class resolver.                                                                                                      |
| `packages/api/src/router/checkin.ts:53`                       | Current check-in targets the signed-in user. Add a restricted device entry point with an explicit selected person.                                          |
| `packages/api/src/router/attendance.ts:64`                    | Staff member lookup returns the full active roster. Add bounded server-side search with a minimal result shape.                                             |
| `packages/api/src/router/attendance.ts:388`                   | Staff walk-in handling accepts a selected person, but differs from self-check-in policy. Share lower-level writes only after preserving the correct policy. |
| `packages/api/src/router/dropin.ts:163`                       | Reuse the existing walk-in submission and lead workflow. Adapt device authorization and rate limits without changing visitor rules.                         |
| `apps/nextjs/src/app/checkin/[academyId]/drop-in-form.tsx:49` | Reuse form fields and consent components. The public form is a personal-device flow without a shared-device reset.                                          |
| `apps/nextjs/src/app/_components/venue-checkin.tsx:27`        | Add reception activation near the existing venue check-in setup.                                                                                            |

Implemented areas: a reception route, a restricted reception API router, and the existing verification table for expiring hashed credentials. No migration, new attendance table, or search dependency was needed.

Preserve existing visitor behavior, including class association and phone-based matching. Any broader changes to visitor capacity or shared-phone handling belong in a separate task. Member check-in must keep its existing admission checks.

## Delivery checklist

- [x] Inspect current member, visitor, and attendance flows.
- [x] Confirm class attendance as the purpose.
- [x] Draft interaction, boundaries, failures, and verification.
- [x] Confirm reuse of the existing walk-in form and owner lead workflow.
- [x] Confirm name-search trust and member admission policy before coding.
- [x] Review device activation against auth and branch isolation. Record the chosen design.
- [x] Build restricted device access, expiry, revocation, and branch setup.
- [x] Build class choice, member autocomplete, check-in, and reset as one usable slice.
- [x] Reuse the walk-in form and lead submission, then add shared-device reset.
- [ ] Verify on a real reception iPad and pilot at one gym.
- [x] Update the product spec, architecture, decision record, roadmap, and changelog when implementation ships.

## Acceptance and verification

The release must demonstrate:

- One available class: typing a name and tapping a result completes attendance without login or a confirmation dialog.
- Multiple classes: attendance always uses the class explicitly selected by that person.
- Existing bookings and members without bookings both follow the agreed admission policy.
- Duplicate names cannot silently select the wrong person.
- Repeated taps, concurrent requests, and uncertain network retries create one attendance result and consume capacity once.
- A walk-in submission appears in the existing Walk-in leads list. The owner can use the current follow-up actions. Class association and repeat submissions behave as they do today.
- Cancelled classes, expired windows, restricted memberships, and full classes receive clear handling.
- A device for one branch cannot search or write in another branch, even with altered request parameters.
- The reception browser cannot access management APIs. Expired and revoked sessions stop working.
- The next person cannot recover the previous person’s form through Back, reload, background resume, or normal browser navigation.
- Labels, keyboard navigation, screen-reader status, touch targets, and both iPad orientations work.

Write focused automated checks for authorization, admission rules, duplicate submissions, and reset behavior during implementation. Do not run tests without an explicit request. Run `pnpm lint` and `pnpm typecheck` after code changes. Hand the relevant test commands to the user.

Verification: source and diff review complete. `pnpm lint` passed (15 tasks). `pnpm typecheck` passed (17 tasks). `git diff --check` passed. Tests have not run, as requested by the repository rules.

Commands for the focused tests:

```sh
pnpm --filter @matops/domain test test/reception.test.ts
pnpm --filter @matops/api test test/reception.test.ts test/checkin-window.test.ts
```

Open Members, Walk-in leads, then “Sign out and open reception” on the iPad. Confirm search, attendance, visitor leads, reset, and revocation with a pilot branch before release.

## Pilot and success measures

Pilot at one gym across at least three busy classes. Keep staff attendance entry available as a fallback.

Proposed targets, not measured outcomes: median member completion below 10 seconds, at least 90% without staff help, and no duplicate attendance from retries. Measure visitor completion separately. Record completion time, success, errors, and staff corrections without logging names, contact details, or search text.

Observe actual use before adding QR identity checks, payments, digital waivers, offline mode, new booking flows, visitor name search, or device-management features.

## Lessons learned

- When a feature reuses an existing workflow, preserve its fields, destination, and owner actions unless a change is explicitly requested.
