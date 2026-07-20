# 27 — Home-screen widget (fast-follow)

Type: grilling
Status: resolved
Blocked by: —

## Question
A home-screen widget to remove "open app + navigate" friction.

## Answer (decided — FAST-FOLLOW, not v1-launch-blocking)
A simple mobile **home-screen widget**: **today's classes** for the active academy, with **one-tap book/cancel**. No navigation into the app for the core daily action.

**Scheduled as a fast-follow** (right after v1 launch), because home widgets need **native code** (iOS WidgetKit / Android app widgets) — a real effort in Expo (dev build + native module, e.g. `expo-apple-targets` / `react-native-android-widget`), not v1-critical. Captured now so the data/API shape (a "today for active academy" query, book/cancel mutations) stays widget-ready.
