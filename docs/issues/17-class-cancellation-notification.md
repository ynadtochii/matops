# 17 — v1 notifications: push + email (incl. class cancellation)

Type: grilling
Status: resolved
Blocked by: —

## Question

**Refines [09](09-mvp-product-spec.md).** The spec waved this away: "no comms domain, so a cancelled class just shows as state on next open." The review flagged it — a student can **show up to a cancelled class**, which directly contradicts the "flawless UX" bet.

Decide the v1 cancellation-notification behavior (without building a full comms domain):
1. **Transactional email on cancel** — a single email to each booked student (via Resend/Postmark). Cheap, no domain, high value. Likely the answer.
2. **Push notification** — better UX, but needs the mobile push pipeline (Expo push), which touches deployment/realtime ([15](15-api-deployment-shape.md)) — may be heavier than v1 wants.
3. **In-app state only** (current spec) — accept the risk, document it.
4. **Both email now, push later.**

Also decide: same treatment for other high-value events (booking confirmation, class-full-freed-a-spot)? Or cancellation only for v1? Output: the v1 notification set, the channel(s), the third-party service, and where it sits in the architecture (a thin notifications helper, not a domain).

## Answer

**Push notifications are folded into v1** (user decision), alongside email for the highest-stakes event. No comms *domain* — a thin `packages/notifications` helper, all serverless-friendly.

**Channels:**
- **Mobile push → Expo Push.** Store each user's Expo push token (a `push_tokens` table keyed by user + device). To notify, the server POSTs token + message to the Expo Push API over HTTPS → Apple APNs / Google FCM → phone. Works when the app is closed. Pure serverless (an HTTPS call).
- **Email → Resend (or Postmark).** Used for the high-stakes cancellation, as a complement to push (a student may have push off). Also an HTTPS call from serverless.
- **Web push (owners):** deferred — owners are at a desk on the web app; low value for v1.

**v1 notification events (kept minimal):**
1. **Class cancelled** → push **+** email to every booked student. Highest stakes (prevents showing up to a dead class); both channels.
2. **Class reminder** (e.g. ~2h before) → push. A serverless **cron** scans upcoming classes with bookings and sends. Reuses the existing cron mechanism ([16](16-materialization-job-scaling.md)).
3. **Membership approved** → push to the student ("You're in — welcome to {Academy}"). Ties to the approval flow ([20](20-instructor-permissions-and-approval-gate.md)).
4. Booking confirmation → in-app is enough for v1; optional push later. (Do not over-notify.)

**Architecture fit:** `packages/notifications` exposes `notifyUsers(userIds, msg)` (push) and `sendEmail(...)`; called from the relevant tRPC mutations (cancel, approve) and the reminder cron. No always-on service, no WebSocket, consistent with the in-Next serverless deploy ([15](15-api-deployment-shape.md)).

**Live in-app updates (WebSockets/SSE) remain OUT for v1** — see the note added to [04](04-realtime-strategy.md). Polling covers freshness; push covers alerts.
