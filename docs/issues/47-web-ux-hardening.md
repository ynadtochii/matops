# 47 · Web UX hardening — safe actions, copy affordances, states, mobile fit

*(Interaction-quality pass on the owner/instructor web app. Builds on the web
design system [43](43-web-design-system-primitives.md) and the app shells
[38](38-app-navigation-shells.md); no domain, no migration, no router change —
presentation + interaction only.)*

## Context

The web app looked right after ADR 43 but still had interaction gaps that a
staff review surfaced across nearly every screen:

- **Destructive actions fired on one click, no confirmation** — roster
  Reject / Suspend / Remove / Make-owner + note Delete, schedule Cancel class,
  templates Delete, payments Reject claim / Delete plan, invites Rotate link.
  Not even a `window.confirm`.
- **Destructive actions were styled as `ghost` + `text-destructive`** instead of
  the real `destructive` variant, so the most dangerous buttons were the
  lowest-contrast ones. `academy-identity.tsx` was the lone gold-standard file
  (display-then-edit, copy button, "Saving…", `aria-label`).
- **Copyable values had no copy button** — the payment reference code, member
  email/phone, drop-in lead contacts. Three hand-rolled copies existed (invite,
  academy code, venue link), each missing the `try/catch` the clipboard write
  needs.
- **Always-open forms** where display-then-edit fits — the bank-details textarea
  (raw `<textarea>`, no label) and every member's dues row.
- **Missing loading/pending feedback** — sign-in and sign-out had no pending
  state at all (double-submit, no confirmation the magic link sent); several
  mutation buttons only disabled without a spinner; the dashboard triage/stat
  cards rendered `0` during load (reads as "nothing to do"); invites and
  join-flow lacked skeleton/error states.
- **Mobile fit** — 8–9px bottom-tab labels/badges below legible size, 3-button
  action clusters that overflowed at 375px, `sm` action buttons with no
  finger-friendly tap height.
- **A11y** — unlabeled nav landmarks, no `aria-current`, unlabeled arrow
  buttons and form controls, no `aria-live` on async results.

## Decision

Build the missing pieces once as shared primitives, then apply them everywhere —
so the fix kills the duplication instead of patching each screen.

- **`@matops/ui/alert-dialog`** — a Radix `AlertDialog` wrapper plus a
  `ConfirmDialog` convenience (trigger + title + body + async `onConfirm` with a
  built-in pending spinner). Every destructive action now confirms through it.
  **The Content/Overlay keep only the *enter* animation** — a close must never
  wait on an exit animation's `animationend`; if that event doesn't fire (some
  environments never run CSS animations) Radix keeps the node mounted and the
  modal is stuck. Unmounting immediately is the safe default for a blocking
  confirm.
- **`@matops/ui/spinner`** — the branded loading spinner: a `currentColor` arc
  over a faint same-colour track, violet by default (`text-brand`) or the
  button's own label colour on a filled button. Reduced-motion shows a static
  arc.
- **`@matops/ui/copy-button`** — the one copy control: `try/catch` + error
  toast, a 1.5s "Copied ✓" state, `aria-label`, icon-only mode for tight rows.
  Replaces the three hand-rolled copies and fills the gaps.
- **`@matops/ui/textarea`** — the multi-line twin of `Input`, so bank details /
  notes stop reading as a raw browser box.
- **Right button roles** — destructive actions use the `destructive` variant;
  one clear primary per view; the pending state is scoped per-row (via the
  mutation's `variables`) so acting on one row no longer greys out every row.
- **Display-then-edit** — bank details and each member's dues row read as plain
  text with an Edit button; the form opens only on Edit (the academy-rename
  pattern).
- **States** — sign-in rebuilt as a client component (`useActionState` +
  `useFormStatus`: pending buttons + "Check your email" / error, `aria-live`);
  sign-out gets a pending state + `try/catch`; the dashboard shows skeletons
  instead of `0` while the numbers load.
- **Mobile + a11y** — bottom tabs at 10px with finger-height targets and
  `aria-current`; action clusters wrap and `sm` buttons get `min-h-11 sm:min-h-8`;
  nav landmarks labelled; arrow buttons and form controls labelled; a "full"
  class no longer paints red (full ≠ error → `text-warning`).

Scope was interaction hardening, not a redesign: no new domains, no token or
router change.

### As built

- New in `packages/ui/src`: `alert-dialog.tsx`, `spinner.tsx`, `copy-button.tsx`,
  `textarea.tsx` (+ exports). Edited screens: roster, payments, schedule,
  templates, schedule-screen, dashboard, invites, sign-in (+ new
  `sign-in-actions.ts`), sign-out, onboarding, academy-switcher, app-shell,
  payment-requisites, academy-identity, venue-checkin, join-flow, drop-in-form.
- Green: `pnpm lint` (15/15) · `pnpm typecheck` (17/17) · `pnpm test` (50) ·
  `next build`. Runtime-checked on the dev server: the confirm dialog
  opens / cancels / re-opens / Escape-closes and unmounts reliably (verified in
  a browser where CSS animations don't fire — the exact case the enter-only
  decision guards); settings + roster render the copy buttons, aria-labels,
  display-then-edit, and destructive confirm (`#82181a` bg) with no console
  errors. **Screenshots + a true 375px viewport were unavailable in the env**
  (CDP capture failed; window resize didn't reach the page viewport), so the
  mobile-specific spacing wants a device pass — consistent with the standing
  mobile-check note.

## Consequences

- Destructive actions across the web app are guarded by one confirm component;
  new destructive actions should use `ConfirmDialog`, not a bare `onClick`.
- Copyable values use `CopyButton`; new loading/pending UI uses `Spinner`;
  multi-line inputs use `Textarea` — the hand-rolled versions are retired.
- The alert-dialog **enter-only animation** is deliberate; do not re-add
  `data-[state=closed]:*` exit classes to a blocking dialog without confirming
  the unmount still happens when animations don't run.
- Follow-ups (not this ADR): a mobile twin of `ConfirmDialog` (RN `Alert`) if the
  Expo app wants the same guard; unifying the three divergent `TabButton`
  implementations; a visual regression pass once screenshotting works in the env.
