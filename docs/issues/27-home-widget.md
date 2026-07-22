# 27 — Home-screen widget (fast-follow)

Type: grilling
Status: resolved
Blocked by: —

## Question
A home-screen widget to remove "open app + navigate" friction.

## Answer (decided — FAST-FOLLOW, not v1-launch-blocking)
A simple mobile **home-screen widget**: **today's classes** for the active academy, with **one-tap book/cancel**. No navigation into the app for the core daily action.

**Scheduled as a fast-follow** (right after v1 launch), because home widgets need **native code** (iOS WidgetKit / Android app widgets) — a real effort in Expo (dev build + native module, e.g. `expo-apple-targets` / `react-native-android-widget`), not v1-critical. Captured now so the data/API shape (a "today for active academy" query, book/cancel mutations) stays widget-ready.

## Promoted → v1.3 R.2 (2026-07-22)

Un-parked into the "Frictionless & Pay" wave as slice **R.2** (spec **S10**), still a **fast-follow off the critical path**. It **mirrors the F.1 card** (the next class to book), not a full "today's classes" grid — the same one-tap intent, less native surface. Refined decision since the original grilling: the widget is **read-only + a deep link** (no auth, no API, no booking inside the widget) — the app writes a small snapshot to a shared store, the widget renders it, and **Book** deep-links into the app where the existing `booking.book` runs. The shared selection is already built + tested: `nextBookableClass` in `@matops/domain` (reused by F.1). Full native handoff: [`docs/home-widget-implementation.md`](../home-widget-implementation.md). Remaining work is native/device-only (WidgetKit target, Android AppWidget, App Group / SharedPreferences snapshot writer, EAS build) — deferred to a device-side task.
