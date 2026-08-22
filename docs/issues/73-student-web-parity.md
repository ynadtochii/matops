# 73 — The student web app reaches parity with the phone app

**Status:** accepted · **Date:** 2026-08-22 · **Area:** student web (S4, S5, S6, S7, S9, S11, S12), shell IA · **Extends:** [57](57-student-onboarding-funnel.md)

## Context

ADR 57 gave a student on the web one screen: the rolling seven-day week with
inline Book and Cancel. That was the right size then. The native app was still
the student's real client, and the web was the first session before they
installed it.

[pilot-plan.md](../pilot-plan.md) changed which client that is. The pilot runs on
**web from day one**, because no mobile wave since v1.8 has been tested on a
device, there is no Apple developer account, and `expo-camera` landed after the
last dev-client build. Mobile follows on its own schedule.

So the student's only client is now the half-built one. Three things were wrong
with it:

- **Most of the product was missing.** No My classes, no training stats, no
  class detail, no dues, no rank, no overdue warning. A student on web could
  book, and nothing else. An owner who set a member's rank or dues had built
  something the student could not see.
- **It did not look like the rest of the app.** One page, no navigation, and a
  page title that was the gym's name. ADR 57 dropped the nav bar on purpose,
  because a one-item bar is not navigation, and that reasoning expires the
  moment there is more than one item.
- **A student who typed `/payments` got a wall of failed queries.** Nav hiding
  is convenience; the tRPC tier is the guard. That is correct for security and
  wrong for a person who lands on the URL.

## Decision

**Give the student the same shell and the same four jobs the app gives them,
minus the camera.** Their tabs are Schedule, My classes, Dues and Profile, the
app's tabs with Scan removed, and they render inside the owner's own sidebar and
bottom tab bar.

**No new procedures, and one moved pure rule.** Everything a student needs was
already built and already on the right tier: `class.mine` / `get` / `attendees`,
`booking.mine` / `book` / `cancel`, `stats.me`, `rank.mine`, `payments.myDues` /
`claim`, `account.updateProfile`. The pure rules the app calls (`splitMyClasses`,
`nextClass`, `trainingStats`, `paymentStatus`, `paymentReference`, `formatRank`,
`visibleAttendees`, `capacityDisplay`) are called here too, so the two clients
cannot drift apart. The one rule that was not shared, `lastClassLabel` ("Today" /
"Yesterday" / "N days ago"), had been copied into the Expo card; it moves to
`@matops/domain` with a test, and both clients call it. This wave is UI wiring,
which is why it fits in one pass.

Five changes:

- **The shell gains student nav items.** The navigation a student needs was
  already built for the owner and switched off by one condition: both nav blocks
  are wrapped in `items.length > 1`, and a student qualified for exactly one.
  Adding items turns on the sidebar and the bottom tab bar with no new markup.
  The rest of the chrome (pending banner, avatar link, theme toggle, sign out)
  already rendered for a student and did not change.
- **`/training` and `/class/[id]` are new.** My classes reads `booking.mine` and
  `stats.me`; class detail reads `class.get` and `class.attendees`, so a student
  sees who else is on the mat under the ADR 55 rule (names for an approved
  viewer, counts for a pending one). Both screens hold to the app's rules rather
  than re-deciding them: Past is uncapped, a class the gym cancelled shows no
  Cancel control (S4), a class that already started says so instead of offering
  nothing, and capacity is the `capacityDisplay` label, which reads "No limit"
  where a hand-written `count/capacity` would have read "3/0". A schedule row
  gains the same discipline dot the owner dashboard draws, since the row is now
  a link into class detail and needed something to carry the category.
- **`/payments` branches by role** instead of getting a second route. An owner
  sees the O7 screen, everyone else sees their own dues with the bank details,
  the reference code and "I paid". This is the shape `dashboard-screen` already
  uses for `StudentScreen`, and it closes the failed-queries hole above.
- **The overdue strip (S11) moves into the shell**, under the pending banner,
  shown only to an **active** non-staff member whose dues are overdue.
  `payments.myDues` is a `memberProcedure`, so the gate is `isActiveMember`, the
  same rule the tier uses: a pending or suspended member is not asked at all.
  On the phone the app has push and local reminders. On the web it has neither,
  so this strip is the only thing that can chase a payment.
- **The switcher reads `academy.memberships`, not `academy.listMine`.**
  `listMine` filters by `isWebLensMembership` (owner, instructor, invited
  instructor), so a student in two gyms saw no switcher at all. `memberships` is
  the list the post-login gate (ADR 49) already offers, so the switcher and the
  gate now agree on which academies exist.

### What this does not change

**Owner and instructor chrome is untouched.** Same seven nav items, same badges,
same screens. The only shared surface that moved is the switcher's source list,
and it grew rather than shrank.

**The scan stays app-only.** The QR poster still encodes the public
`/checkin/<academyId>` page (ADR 57, ADR 70), and that page already works in a
phone browser, so a walk-in on web is a complete path. What the web cannot do is
scan from inside the app, and building a browser camera scanner for a flow that
has a working URL is not worth the permission prompt.

**Push and class reminders stay app-only.** matops ships no scheduler (ADR 46),
and the app's reminders are scheduled on the device (ADR 54). A web student gets
no reminder. This is named in the pilot brief as a known gap, not hidden.

**The approval gate is unchanged.** A pending member still books provisionally,
still sees counts instead of names, and now also sees the Dues tab hidden rather
than a forbidden error, because `payments.myDues` is a `memberProcedure`.

## Consequences

- The student web is no longer "the first session". It is the product, and the
  native app becomes the better version of something that already works.
- One more query runs per page load for an active non-staff member
  (`payments.myDues`, for the overdue strip). It is gated off for staff and for
  any member the `memberProcedure` tier would refuse.
- An owner who also trains at another gym now sees that gym in their switcher.
  That is the gate's behaviour applied consistently, and it is what the mobile
  app has always done.
- Six spec IDs that read "app-only" no longer do. S4's line about the web
  student having one screen and no nav bar is now false and was rewritten.
- Verified by the static gates and a first `next build` since v2.4. The screens
  themselves have not been walked through in a browser in this session; the
  pilot dry run in `pilot-plan.md` covers that.
