# 80 — Three kinds of waiting, and only one of them gets a spinner

**Status:** accepted · **Date:** 2026-08-23 · **Area:** both clients (`apps/nextjs`, `apps/expo`) · **Extends:** [37](37-brand-and-shells.md), [44](44-mobile-dark-first-design-system.md), [74](74-web-shell-seams.md)

## Context

Every screen in the web app was already disciplined about the empty state and
the failed state. `states.tsx` gave both one shape, and thirteen screens used
them. The loading state was the exception: one component, `SkeletonRows`, four
grey bars 48px tall, standing in for whatever the screen was about to draw.

That placeholder was wrong in three separate ways, and the cost was the same
each time: the page jumped when the data arrived.

- **It never matched the screen.** The dashboard's day block is a dot, a mono
  time, a title and a headcount on a hairline rail. The week grid is seven
  columns of blocks over an hour gutter. The coach card is five numbers in a
  five-column grid. All three drew four identical grey bars, and all three
  re-flowed the moment the query settled.
- **The route change had no placeholder at all.** No route under `(app)/` had a
  `loading.tsx`, so a click on Members held the old screen, then swapped the
  whole page at once.
- **The boot drew a skeleton for a layout that half the time never arrives.**
  `AppShell` resolves the active academy before it renders anything, and the
  answer is either the shell or the academy gate, which shares none of its
  chrome. A skeleton there is a guess about which one, and it is wrong for
  every new member.

Underneath that: the app has no loading moment that looks like matops. The
brand is one violet and one mark (ADR [37](37-brand-and-shells.md)), and the
first thing a person sees on a cold open is grey bars.

## Decision

**Three tiers, picked by whether there is anything to mirror yet.**

| The wait                            | What it draws         | Where                                |
| ----------------------------------- | --------------------- | ------------------------------------ |
| The app boot, and the academy gate  | The mat loader        | `mat-loader.tsx`                     |
| A route change, shell already drawn | The screen's skeleton | each route's `loading.tsx`           |
| Data filling into a drawn screen    | The same skeleton     | `skeletons.tsx`, at each `isPending` |

Tier 1 gets the brand moment because there is nothing on screen to be faithful
to. Tiers 2 and 3 get a skeleton because there is, and a spinner in front of a
shape we already know is a worse answer than the shape.

**The loader is the mark laying itself.** `MatLoader` is the basketweave mark
from `@matops/ui/logo` with its seam path split into six, each drawing on with
`stroke-dashoffset`, staggered 90ms apart in weave order: the two long centre
seams, then the four planks. It is how a gym lays mats before class. Nothing
new enters the identity: same tile, same violet, same seams, same 85% opacity.
The keyframes live in `apps/nextjs/src/app/styles.css` next to the blueprint
motifs, because this is a web shape and NativeWind should not have to parse it.

The wrapper fades in on a **180ms delay** with `animation-fill-mode: backwards`,
so a boot that resolves faster than that shows nothing at all. A loader that
flashes for one frame is worse than no loader.

The label is a prop and it says what is happening: `Opening your academy`, not
`Loading…`. Reduced motion stops the weave and leaves the mark whole; the label
carries "busy" on its own.

**A skeleton is built from the shape it replaces, not from a generic bar.**
`skeletons.tsx` holds one vocabulary, and each piece is cut from a real one:
`SkeletonRow` uses `cardClass()`, `SkeletonSection` draws `Section`'s real
hairlines around a placeholder label, `SkeletonQueue` is the O1 instrument
strip's own tile geometry, `SkeletonWeekGrid` is the O2 grid's column template
and 64px hour rows. Structural lines (`--border` hairlines, the day rail, the
grid) are drawn for real and do not pulse: they are not unknown, only the
content is.

**A route's `loading.tsx` and its screen render the same component.** Twelve
routes each export one screen skeleton, and the screen's own `isPending` branch
renders the same piece. The placeholder therefore does not move between the
route change and the data arriving: it appears once and is replaced once.

**Two routes stay deliberately vague.** `/` is the owner dashboard for staff
and the week's schedule for a student, and `/payments` is claims or dues, but
`loading.tsx` is a server file that runs before the shell mounts and knows no
role. Both draw only what the two versions share: a title over a stack of
cards. Drawing the owner's tabs and taking them away from a student would be a
worse lie than drawing less.

## The phone, same rule, two tiers

`apps/expo` had the same gap in a different shape. It never had a skeleton at
all: `Loading` (a full-screen `ActivityIndicator`) and `InlineLoading` (the same
spinner, inline) covered every wait, so a spinner sat where a week of classes,
a class detail, a dues card, a notification feed and a stats card were about to
be.

**Two tiers here, not three.** Expo Router has no route-level loading boundary,
so a screen's own `isPending` is the only place a placeholder goes, and tiers 2
and 3 collapse into one. That is a simplification, not a compromise: on web the
two tiers exist only so the placeholder does not change between them.

- **`Loading` is the mat loader now**, so all six gates that already called it
  (the auth gate, the academy resolve, the magic link, an invite opening, the
  check-in gate, the profile session) got it without a call-site change. It
  takes a `label`, and the ones with something nameable to say now say it.
- **The mark is drawn the same way it always was on native** - positioned Views,
  no SVG dependency (ADR [44](44-mobile-dark-first-design-system.md)) - and each
  seam scales from the end it starts at (`transformOrigin`, `scaleX` / `scaleY`),
  90ms apart, on the native driver. Same six planks, same order, same 1900ms
  cycle and 180ms anti-flash delay as the web.
- **`components/skeletons.tsx` mirrors the web file**, cut from the real native
  shapes: the class row is the discipline rail, the 48px time column and the row
  button; the day rule keeps its real hairlines; the stats card is the 22px
  numeral over its eyebrow. One `Animated` pulse for the whole app, ref-counted,
  so thirty bars on a screen breathe together and nothing loops while nothing is
  on screen. One `reduce motion` subscription, for the same reason.
- **`InlineLoading` is gone.** After the pass its only caller was the onboarding
  gym search, where the **Find gym** button already spins for that same fetch.
  Two indicators for one action is noise, so the duplicate went and the export
  with it. A spinner still belongs on an action in flight; the `Button` owns
  that, which is the whole of it.

## Consequences

- `SkeletonRows` left `states.tsx`; that file is the empty / failed / no-access
  half now, and `skeletons.tsx` is the loading half. Every one of the 32 call
  sites moved to a shape that matches what follows it.
- The two hand-rolled pulses inside `dashboard-screen.tsx` (the `h-24` block
  over the queue, the `h-3 w-56` caption) are `SkeletonQueue` and `Bar`.
- **A skeleton is part of a component's shape.** When a list row, a section or
  a card changes, its skeleton changes in the same edit. Nothing enforces this;
  the file says it at the top.
- On the phone, `ui.tsx` keeps the empty / failed / suspended half and
  `skeletons.tsx` takes the loading half, the same split as the web.
- **Neither loader has been seen on a device.** The build env has no simulator
  and no browser extension, so the weave timing, the `transformOrigin` scaling
  on native, and the fit of each skeleton to the screen behind it all want an
  eyeball pass (`docs/mobile-device-test.md`).
