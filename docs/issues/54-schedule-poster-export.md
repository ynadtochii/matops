# 54 — Export the weekly schedule as a shareable poster

**Status:** accepted · **Date:** 2026-08-19 · **Area:** staff web / O3 templates

## Context

An owner who changes the schedule has to tell people. Today they retype the
board into an Instagram post or a WhatsApp message by hand, so the shared copy
drifts from the real one. They asked for one button that produces an image.

An image of the schedule is also an acquisition surface. Every gym that posts
one is showing the join code to people who do not have the app yet.

## Decision

- **Export the recurring templates, not a dated week.** Templates carry no
  booking data, so "no booking numbers on it" costs nothing to honor. They
  store `starts_at_minutes` as local wall-clock, so the poster is correct no
  matter what zone the owner's browser is in, where the week view would render
  a travelling owner's board in the wrong zone. And it does not go stale: no
  dates on it, so it stays true until the schedule itself changes.
- **Only `active` templates.** A paused template runs no classes, so printing
  it would advertise a class nobody can attend.
- **Draw it on a `<canvas>`, not with a library or a server renderer.** The
  poster is rectangles and text, which the 2D context does without a
  dependency. The canvas element is also the preview, so "see before you post"
  is free. `next/og` would have given a shareable URL but needs new route auth,
  Geist as raw font buffers, and a second layout in Satori's CSS subset.
- **Landscape 1600x1200, exported at 2x** (3200x2400). Six columns need the
  width; a 4:5 portrait crop squeezes them to the point of illegibility.
- **The poster is always light**, whatever theme the app is in. It is a
  printed artifact, so its palette is fixed in `poster-draw.ts` rather than
  read from the live CSS variables.
- **No live "now" marker.** A timestamp inside a shared image is wrong the
  moment it is posted. The footer instead carries "Updated <date>", which
  tells a member whether the board they are looking at is current.
- **The footer sells the join code**: "Join with gym code 990001" over "Book
  your spot in the matops app". The 6-digit code is already the join path on
  web and mobile, so an academy can be attributed to a poster with no new
  tracking.
- **Block fills are pre-blended against the paper**, not painted at 8% alpha.
  A translucent fill let the hour lines show through the blocks, which read as
  a line crossing a class. The grid stays strictly under the blocks.

## Consequences

- `template.list` gains `instructorName` (left join on `user`, the pattern
  `class.get` and `class.week` already use), because the coach's name belongs
  on the poster.
- Nothing new on the server: no route, no migration, no RLS surface, no
  dependency. The whole feature is a pure layout function, a draw function, and
  a dialog.
- The poster and the week grid now share an encoding (teal gi, amber no-gi,
  dashed open mat, collapsed empty hours) but not code. They render different
  sources, in different units, for different media. Copying the rules was
  cheaper than an abstraction over both.
- A public, always-current schedule page would beat an image that goes stale.
  That is a separate feature; the poster is what people paste into a story.
