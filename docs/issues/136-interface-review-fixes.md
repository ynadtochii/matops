# 136. Interface review fixes: a focus ring you can see, callout ink per theme

**Status:** accepted
**Date:** 2026-09-09
**Supersedes in part:** [37](37-brand-and-shells.md) §callouts, and the `--ring`
row of `docs/design.md` §1.1.

## Context

A cross-discipline interface review of the web app (accessibility, layout,
writing, typography, colour, visual polish) measured every token pair in both
themes and swept all 116 components. Three failures blocked, four were worth
fixing in the same pass. Everything else the review checked already held, and
the checks that were dropped are listed at the end.

## Decision

### 1. `--ring` is the brand violet, and the ring is never partially transparent

`FOCUS_RING` was `ring-ring/50 ring-[3px]`. Rendered, that is
`color-mix(in oklab, #a6a09b 50%, transparent)` over white, which is `#d2d0cd`
at **1.54:1**. WCAG 1.4.11 wants 3:1. At full opacity the stone-400 ring is
still only 2.59:1, and no grey in the stone ramp clears 3:1 on white without
reading as a border rather than a ring.

`--ring` becomes `#6a4dff` light and `#8b72ff` dark, which is `--brand` in each
theme. design.md §1.1 already listed focus as a brand job, so this closes a gap
between the doc and the code rather than opening a new one. The recipe is now a
2px ring at a **2px offset on `--background`**. The offset is what makes the
adjacency question go away: the ring never touches the button fill, so it never
has to contrast with ink, with near-white, or with the red of a destructive
button. It only has to beat the page, which it does at 5.10:1 and 5.95:1.

`FOCUS_RING_INSET` keeps its own 2px inset ring for controls flush to an edge.
The five files that had hand-copied the ring string now compose `FOCUS_RING`.

### 2. Callout accents are per theme

`--info` / `--warning` / `--error` / `--success` were one shared set, tuned for
the black surface. As text on white: success **2.22:1**, warning **2.89:1**,
error **3.81:1**, info **3.76:1**, against the 4.5:1 that 11px to 14px text
needs. These tokens are ink at least as often as fill: every `FieldError`, every
`destructive-outline` button label, the drift badges, the stat deltas.

Light gets a darker set (`#1257c7` / `#a34500` / `#c8102b` / `#0a7d3c`), dark
keeps the originals, and `--warning-foreground` and `--success-foreground` go
white in light so the fill role still pairs. Every text pair now lands between
5.01 and 6.53, every fill pair between 5.23 and 6.72.

The one pair still under 4.5 is `--error-foreground` on a solid `--error` fill
in dark, at 3.65. Left alone deliberately: no component paints that pair. Every
solid `bg-error` in the app is a dot, a bar, or a rail, which is non-text and
clears 3:1.

### 3. The privacy policy reads its identity from the environment

`policy-text.tsx` shipped `[ENTITY]`, `[ADDRESS]` and `[CONTACT EMAIL]` as
literal text. They were served on the public `/privacy` route and inside the
consent dialog that gates the public booking form, so a stranger handing over a
name, phone and email met a policy that promised a deletion route and named no
address to ask at.

They become three required `NEXT_PUBLIC_` client vars in `apps/nextjs/src/env.ts`.
Client vars rather than server ones because `policy-text.tsx` is rendered by a
server page **and** by a client dialog, and because a policy contact is public
by definition. Required rather than defaulted, so an unset value fails the boot
instead of shipping a placeholder a second time.

### 4. Four smaller ones

- **A skip link.** `ShellFrame` puts roughly ten sidebar links and header
  controls before `<main>` on every authenticated page. `Skip to content` is now
  the first focusable element, and `<main>` carries `id="main"`.
- **Error toasts wait.** `@matops/ui/toast` re-exports Sonner's `toast` with
  `error` pinned to `duration: Infinity`, and the `Toaster` gains `closeButton`.
  An error was the only account of what went wrong and it left after four
  seconds. One wrapper rather than an option at 80 call sites.
- **Every error names a next step.** 57 messages went from `Could not save` to
  `Couldn't save. Try again.`, matching the wording the sign-out handler already
  used. The seven fully generic ones (`Action failed`, `Could not do that`) sit
  on shared `onError` handlers that cover several mutations, so they cannot name
  the action: they become `Couldn't finish that. Check your connection and try
  again.`
- **The policy prose caps its measure** at `58ch`. It ran to about 95 characters
  a line, and it is the longest prose in the product.

## Checked and left alone

Recorded so the same ground is not re-walked. The 31 hand-rolled `<button>`
elements carry no focus class, and that is correct: nothing resets `outline`
globally, so they keep the browser's own indicator. `mat-seam` is an infinite
animation and is guarded, on both the wrapper and each seam. Hover is not gated
by hand because Tailwind v4 emits every `hover:` inside `@media (hover: hover)`.
`StatDelta` and `DriftBadge` already carry an arrow, `sr-only` text, or a label,
so no state rides on hue alone. RTL and logical properties are out of scope
while the app is English-only.

## Consequences

- **A deploy needs three new env vars** (`NEXT_PUBLIC_LEGAL_ENTITY`,
  `NEXT_PUBLIC_LEGAL_ADDRESS`, `NEXT_PUBLIC_PRIVACY_CONTACT`) in Vercel and in
  every local `.env`, or the app will not boot.
- Focus is violet now, not grey, on both themes and both clients.
- Light-theme reds, greens and oranges are visibly darker. This is the point.
- No migration. No API change. No test change.

## Addendum · 2026-09-27

The three public legal/privacy environment variables and their startup validation
are removed. `/privacy` now directs member data requests to the academy and
MatOps questions to the existing feedback email. The operator's legal identity
and address are still an S7 pre-invitation release check; the support email does
not establish them. This supersedes the environment-variable consequence above.
