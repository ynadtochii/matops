# Mobile ease-of-use plan (v1.8)

**Status:** proposed / not started · **Date:** 2026-07-23 · **Scope:** Expo
student app only — information architecture + core-flow friction. **No new
domain, no migration** expected (booking, attendance, payments already exist —
this re-shapes how the student reaches them).

This is a **plan**, not a spec change. When each slice ships, update
`docs/spec.md`, `docs/architecture.md`, `docs/roadmap.md`, `CHANGELOG.md`, and
record the decisions as **ADR 45** (see §7), per the Definition of Done.

---

## 1. Why

An expert UI/UX review of the v1.7 app found the layout distinctive but not as
*easy* as it can be. Three friction points drive this plan:

1. **Two tabs do the same job.** `Schedule` (all classes) and `Training` (my
   classes) both open with a "Next class" card; the difference isn't clear from
   the labels, so the student makes a needless choice on every open.
2. **A rare action sits in the front row.** `Check in` is a permanent tab that is
   empty most of the time, while **booking** — the core repeated action — is 3
   taps deep (S4 → tap class → S5 → Book).
3. **The one urgent money state is hidden.** An **overdue** payment lives at the
   bottom of Profile; the student has to go looking for a problem that should
   find them.

## 2. Decisions locked (owner input, 2026-07-23)

- **Remove in-app check-in.** Booking is the pre-commit; the **owner marks
  attendance after class** (web O5). No student-facing "Check in" tab or list.
- **Keep QR only for walk-ins.** A student who did **not** book scans the gym's
  QR → the app **auto-confirms attendance** (book + attend in one). This is the
  only surviving check-in path.
- **Rank + normal dues stay quiet.** Leave both on Profile (S7) as they are. Do
  **not** elevate them. Only **overdue** dues get promoted.
- **Overdue → permanent warning header.** When a member is overdue, show a
  persistent top strip on the main screens; tapping it opens the payment details.
- **Split app Settings from Profile** where possible.

These additions do **not** override the kept suggestions in §4 (inline booking,
naming clarity, booking feedback).

## 3. Target navigation

```
v1.7 (4 tabs)                 v1.8 (3 tabs + gear + global header)
─────────────                 ────────────────────────────────────
Schedule                      Schedule     S4  · all classes · book inline from the row
Training                      My classes   S6  · booked + next + small training card
Check in   ✗ removed          Profile      S7  · identity · rank · dues · academy switcher
Profile                         └ ⚙ gear → Settings  S12 · appearance · notifications · sign out

GLOBAL   ▸ Overdue warning strip (all tab screens) → tap → S7 dues        [new S11]
WALK-IN  ▸ Gym QR poster → deep link → app → auto book + attend today     [S8 redefined]
```

**Open decision (pick one before building slice 5):**
- **A — Settings behind a gear in Profile** *(recommended)* — keeps 3 clean tabs;
  the standard mobile pattern. Settings is a pushed screen, not a tab.
- **B — Settings as a 4th tab** — everything visible, but a thin tab (3 items).

Default to **A** unless the owner prefers B.

## 4. Slices

Effort key: **S** ≈ hours · **M** ≈ 1–2 days · (no back-end work expected).

### Slice 1 — Inline booking on the schedule (S4/S5) · **S–M** · do first
Book directly from a Schedule row instead of Schedule → detail → Book.
- Each upcoming, bookable row gets a compact **Book** control; booking uses the
  existing `booking.book` + the current soft-capacity "looks full — book anyway?"
  confirm. A booked row shows the existing "Booked" pill.
- The class detail (S5) stays as the place for full info + Cancel; it is no longer
  required to book.
- **Acceptance:** a student can book any bookable class from the Schedule list in
  **one tap** (plus the capacity confirm when over). Cancelled/past/full rows
  behave as today. No change to the booking rules or counts.

### Slice 2 — End the Schedule/Training overlap (S4/S6) · **S** · do first
- **Rename** the `Training` tab to **My classes** (label + tab).
- Keep the one-tap "Next class" card on **My classes only**; **remove** the
  duplicate featured card from Schedule (Schedule becomes the clean browse+book
  list; slice 1 makes booking one tap there anyway).
- **Acceptance:** the two class tabs are self-explaining (all classes vs. mine);
  "Next class" appears in exactly one place. Verified by the tree test (§6).

### Slice 3 — Overdue warning header (new S11) · **S–M** · do first
A persistent, slim strip shown on the main tab screens whenever the member is
**overdue** (status derived from `next_due_at`, ADR 40 — never stored).
- **Non-dismissible while overdue**; it disappears automatically when the owner
  confirms payment (status leaves `overdue`).
- **Tap → S7 Profile → dues**, positioned on the pay section (bank details +
  reference ready to copy).
- **Copy:** plain, non-shaming — e.g. *"Membership payment overdue — tap to pay."*
- **Design:** a **thin** strip in the error/overdue accent (reuse the dashed
  callout style), never a full block; must not cover content or block scroll.
- **Coexistence:** the S3 pending banner stays inline on Schedule; the overdue
  strip sits above content globally. Never stack two heavy blocks — the strip is
  thin by design.
- **Acceptance:** an overdue member sees the strip on Schedule / My classes /
  Profile; a paid / due-soon member never sees it; tapping lands on the dues
  detail; the strip clears within one refresh of being marked paid.

### Slice 4 — QR walk-in = auto book + attend (S8 redefined) · **M** · next
Replace the Check-in tab with the QR walk-in path.
- **Remove** the `Check in` tab and the in-app "confirm your class" list.
- The gym's physical QR poster encodes a **deep link** (`matops://…`). A signed-in
  student opening it → the app **books + marks attended** for the class happening
  now → a clear *"You're checked in ✓"* confirmation. Uses the phone's native
  camera (no in-app scanner, no camera permission flow).
- **Edge cases (must spec):**
  - *Not signed in* → route through sign-in (S1), then complete the check-in
    (same pattern as invite deep links).
  - *No class live* → *"No class to check into right now."*
  - *Already booked* → mark attended, don't double-book.
  - *Pending member* → allowed (provisional), same as booking.
- **Acceptance:** scanning the gym poster with the app installed records
  attendance in one flow, no tab needed; every edge case shows a clear message and
  is never a dead end (the owner can still mark present manually, O5).
- *Note:* confirm the venue QR currently encodes (or can encode) a deep link that
  triggers this, vs. today's public drop-in URL — this is the main unknown to
  scope.

### Slice 5 — Split Settings from Profile (S7 + new S12) · **S** · next
- **Profile (S7):** identity (name/phone/email), rank, dues, academy switcher.
- **Settings (S12):** appearance (light/dark/system — moved off Profile where
  v1.7 put it), push notifications toggle, sign out.
- Reached via a **gear icon in the Profile header** (decision A) → a pushed
  Settings screen.
- **Acceptance:** appearance + notifications + sign out live on a dedicated
  Settings screen; Profile holds only identity + membership; nothing is lost.

### Slice 6 — Booking feedback polish (S4/S5) · **S** · next
- A lightweight **toast** after booking ("Booked — Tue 18:00") so the action
  feels finished (no toast system on mobile today — thin add).
- **Sticky bottom "Book / Cancel" CTA** on S5 (thumb zone).
- **Acceptance:** booking/cancelling shows a clear confirmation; the S5 primary
  action is reachable one-thumbed.

### Slice 7 — Dark-theme warmth pass · **S** · after a device check
- Once the app is testable on a real device, review whether pure-black + 3px
  corners read as cold for casual students; keep mono for data, adjust surface
  warmth/contrast if needed. Low priority; do not block flow work.

## 5. Sequence & the 80/20

Ship **1 → 2 → 3** first: together they remove the biggest daily frictions
(tap-depth, tab confusion, hidden overdue money) and are all low effort with no
back-end work. Then **4 → 5 → 6**. **7** waits for device access.

| # | Slice | Impact | Effort | Back-end? |
|---|---|---|---|---|
| 1 | Inline booking | High | S–M | no |
| 2 | Rename + de-dupe class tabs | High | S | no |
| 3 | Overdue warning header | High | S–M | no |
| 4 | QR walk-in (auto book+attend) | Med–High | M | maybe (QR payload) |
| 5 | Split Settings from Profile | Med | S | no |
| 6 | Booking toast + sticky CTA | Med | S | no |
| 7 | Dark-theme warmth pass | Med | S | no |

## 6. Validate before building nav changes

Riskiest assumption: *"Schedule vs. My classes is now clear."* Cheapest test — a
15-minute **tree test** with 5–8 students: *"Where do you book Thursday's
class?"* / *"Where do you see what you already booked?"* If they hesitate or
split between the tabs, the rename (slice 2) is confirmed; if not, it may not be
needed. Everything else in this plan is low-risk and can go straight to build.

## 7. Risks & second-order effects

- **QR failure = feeling stuck.** A walk-in whose scan fails (sign-in mid-flow,
  no class live) must always see a clear message; the owner marking present
  manually (O5) is the safety net, so it is never a dead end.
- **One-tap booking raises volume** → over-capacity confirms fire more often →
  keep the "looks full — book anyway?" copy and the confirmed/provisional count
  clear at higher volume.
- **Permanent header fatigue.** Justified only because it is actionable and
  self-clearing; keep it thin, never blocking. Revisit if overdue states turn out
  common and long-lived.
- **Opportunity cost:** slice 4 (QR) is the heaviest — do not let it jump ahead of
  1–3, which are cheaper and higher impact.

## 8. Out of scope (v1.8 non-goals)

- No new payment mechanics (still manual bank transfer, ADR 40) — only the
  **overdue surfacing** changes.
- No rank/stats elevation (owner decision) — S7 keeps them as-is.
- No in-app QR **scanner** UI (native camera + deep link is enough); revisit only
  if the deep-link path proves insufficient.
- No back-end / RLS / migration work anticipated; if slice 4's QR payload needs a
  server change, spec it in that slice's ADR note.

## 9. Definition-of-Done checklist (per slice, when it ships)

- [ ] Update `docs/spec.md` — S4/S6 (booking + rename), S8 (redefine), S7 + new
      S12 (settings split), new S11 (overdue header).
- [ ] Update `docs/architecture.md` §0 as-built + record **ADR 45** (decisions:
      remove in-app check-in · QR-only walk-in · overdue header · Profile/Settings
      split).
- [ ] Flip the slice's row in `docs/roadmap.md` (add a **v1.8** section).
- [ ] One line in `CHANGELOG.md`.
- [ ] Add ADR 45 to the `docs/map.md` index.
- [ ] Gates green: `pnpm -F @matops/expo typecheck · lint · format` (+ device
      check where possible).
