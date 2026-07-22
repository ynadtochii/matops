# Home-screen widget — implementation guide (v1.3 R.2)

**Status: scaffolded, native build deferred.** This is the handoff for building the
R.2 native home-screen widget. The data selection is already built and tested in
`@matops/domain`; everything below the JS line needs a **dev build on a real
device** (no simulator/Xcode in the CI env), so it ships as a fast-follow — off
the payments critical path (roadmap v1.3; ticket [27](issues/27-home-widget.md)).

## Goal

Put the F.1 "Next class" card on the phone **home screen**: the one class the
student would book next, with a **Book** action, without opening the app (spec
**S10**). It mirrors the F.1 card exactly — same selection, same soft-capacity
idea — so the two surfaces never disagree.

## The one rule that keeps this simple

**The widget is read-only + a deep link. It never calls the API or holds auth.**

A home widget runs in a separate process with its own (very limited) lifecycle.
Doing authenticated tRPC calls or a booking mutation from inside the widget means
sharing the session token into the widget process and handling network + errors
in an extension — a large, fragile surface. We avoid all of it:

- The **app** owns data + auth. It writes a tiny **snapshot** of the next class to
  a **shared store** both processes can read.
- The **widget** only renders that snapshot and offers a **Book** button that
  **deep-links into the app** (`matops://…`). The actual booking happens in the
  app, using the session and mutation that already exist.

This means: no auth in the widget, no API in the widget, no new booking path. The
only new backend-shaped thing is "the app writes a snapshot file"; the booking
itself is the existing `booking.book`.

## Already built (the JS contract) — reuse, don't re-derive

`@matops/domain` → **`nextBookableClass(classes, now)`** (`schedule.ts`, unit
tested). It returns the soonest upcoming, non-cancelled class the student has not
booked (else the soonest upcoming; null when nothing is upcoming). F.1's card
already uses it. The widget's data feed must use the **same** function so both
surfaces pick the same class.

The **snapshot** the app writes (suggested shape — keep it tiny; the widget only
needs to render + deep-link):

```jsonc
// widget-snapshot.json (written to the shared App Group / SharedPreferences)
{
  "academyName": "Ronin BJJ",
  "classId": "…uuid…",
  "title": "No-Gi Fundamentals",
  "whenLabel": "Today · 18:00",     // pre-formatted in the app (F.1 whenLabel)
  "spotsLabel": "6 spots left",     // reuse utils/format spotsLeftLabel
  "state": "bookable",              // "bookable" | "booked" | "empty"
  "updatedAt": "2026-07-22T12:00:00Z"
}
```

Write it from the app whenever the schedule is fetched (and on app
background/foreground). Selection = `nextBookableClass(classMineData, new Date())`;
label formatting = the same `whenLabel` / `spotsLeftLabel` the F.1 card uses.

## iOS — WidgetKit

Expo has no managed widget API, so this is a native target added via a config
plugin. Two viable routes:

- **`@bacons/apple-targets`** (Expo config plugin that adds an app-extension
  target + Swift sources to the prebuild). Preferred — keeps the widget in the
  repo and rebuilt by EAS.
- Hand-managed Xcode target after `expo prebuild` (more manual; loses the managed
  workflow).

Steps:

1. **App Group** — create `group.tech.matops.app` (or your bundle-matched id) and
   enable it on **both** the app and the widget target (entitlements). This is the
   shared store: the app writes `widget-snapshot.json` into the App Group
   container; the widget reads it.
2. **Widget target** — a `WidgetKit` `TimelineProvider` that reads the snapshot
   from the App Group container and renders `title` / `whenLabel` / `spotsLabel`.
   Small/medium families are enough. Timeline: a short refresh (e.g. 30–60 min)
   plus a reload the app triggers via `WidgetCenter.shared.reloadAllTimelines()`
   after it writes a fresh snapshot.
3. **Book button** — a `Link`/`widgetURL(URL(string: "matops://class/<classId>"))`
   so tapping opens the app on the class, where the existing Book flow runs. (Or a
   dedicated `matops://book/<classId>` that books on open — see deep link below.)
4. **Session sharing** — none needed. The widget shows read-only data; auth stays
   in the app. (If a future iteration wants the widget to reflect booked state
   instantly, the app just rewrites the snapshot with `state: "booked"` and
   reloads the timeline.)

## Android — App Widget

Two routes, same principle:

- **`react-native-android-widget`** — lets you describe the widget UI in JS/TSX
  and handles the `AppWidgetProvider` glue. Preferred for staying in-repo.
- A hand-written `AppWidgetProvider` + `RemoteViews` in native Android.

Shared store = `SharedPreferences` (or a file) written by the app, read by the
provider. The Book button = a `PendingIntent` firing the `matops://…` deep link.
Refresh via `AppWidgetManager.updateAppWidget` on a periodic `WorkManager` job +
an app-triggered update after it writes the snapshot.

## Deep link wiring (app side)

The app already handles the `matops://` scheme (magic-link return, join links —
ADR [31](issues/31-deep-link-approach.md)). Add one of:

- **`matops://class/<id>`** → open the class detail (S5), where Book already lives.
  Lowest risk; one extra tap. Reuses the existing `/class/[id]` route.
- **`matops://book/<id>`** → a route that runs `booking.book({classId})` on open
  (with the soft-capacity confirm), then shows the result. True one-tap, slightly
  more code.

Recommend shipping **`class/<id>`** first (trivial, reuses S5), then upgrading to
`book/<id>` if the extra tap is worth removing.

## Data freshness

The snapshot is only as fresh as the last app write. Acceptable for v1: write on
every schedule fetch + on app foreground/background. A class booked from another
device won't update the widget until the app next runs — fine for a fast-follow.
(A background-fetch task that re-selects `nextBookableClass` and rewrites the
snapshot can tighten this later; it still needs no auth in the widget if the app's
background task does the fetch.)

## Build & verify

1. `expo prebuild` (or EAS build) with the widget plugin configured.
2. Dev build on a **real device** (widgets don't fully exercise in the simulator,
   and the App Group container behaves like production only on device).
3. Add the widget to the home screen; confirm it shows the next class, that the
   app writing a snapshot + timeline reload updates it, and that **Book** deep-links
   into the app and books.
4. Add these checks to `docs/mobile-device-test.md`.

## What's in the repo now vs. what remains

- **Done (this scaffold):** `nextBookableClass` in `@matops/domain` (+ tests),
  reused by the F.1 card — the shared, tested selection the widget's data feed
  will call. The `matops://` scheme + `/class/[id]` route already exist.
- **Remaining (native, device-only):** the App Group / SharedPreferences store +
  the snapshot writer in the app; the iOS WidgetKit target + Android AppWidget; the
  `book`/`class` deep-link handler (if upgrading past the existing `class/[id]`);
  the timeline/refresh wiring; EAS build config; device verification.

## Decisions locked here

- **Read-only widget + deep link** (no auth/API/booking in the widget) — the whole
  reason this is a fast-follow and not a rewrite.
- **One shared selection** (`nextBookableClass`) for the card and the widget — they
  can never show different "next" classes.
- **Snapshot, not live query** — the app writes a tiny JSON to the shared store;
  the widget renders it. Freshness is best-effort, tightened later if needed.
- **Ship `class/<id>` deep link first**, upgrade to one-tap `book/<id>` later.
