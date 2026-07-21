# 34 — Notifications layering: transport vs resolution vs message text

Type: architecture
Status: resolved
Blocked by: —
Refines: [17](17-class-cancellation-notification.md)

## Question

ADR [17](17-class-cancellation-notification.md) settled the v1 notification set
(class cancelled → push + email; class reminder → push; membership approved →
push) and sketched a `packages/notifications` exposing `notifyUsers(userIds,
msg)` + `sendEmail(...)`. Building it (Phase 4) surfaced a layering question that
17 did not pin down: **where does each responsibility live?**

`notifyUsers(userIds, msg)` bundles three different concerns:
1. **Transport** — the HTTPS call to Expo Push / Resend.
2. **Recipient resolution** — turning `userIds` into device tokens + emails,
   which needs the database.
3. **Message text** — the actual title/body/subject strings.

If all three sit in `packages/notifications`, that package must depend on
`@matops/db` (a DB dependency inside a "thin transport helper") and its output is
hard to unit-test (message text tangled with a network call).

## Answer

**Split the three concerns across the packages that already own them. The
`notifications` package is pure transport — no DB dependency.**

- **Transport → `packages/notifications`.** `sendPush(tokens, payload)` (batched
  Expo Push, chunked to 100) + `sendEmail(payload)` (Resend). Serverless HTTPS
  only. **Never throws** — a transport failure is logged and swallowed, so a
  notification can never fail the mutation that fired it. Degrades to a no-op +
  log when `RESEND_API_KEY` / `RESEND_FROM` are unset. No `@matops/db` import.
- **Message text → `packages/domain`** (`notify.ts`). Pure builders
  (`buildCancelledMessage`, `buildClassChangeMessage`, `buildApprovalMessage`,
  `buildReminderMessage`) + `formatWhen` + the reminder-window predicate
  (`isInReminderWindow`). Trivially unit-tested (13 tests).
- **Recipient resolution + orchestration → `packages/api`** (`notify.ts`).
  `notifyClassCancelled` / `notifyClassChanged` / `notifyMembershipApproved` /
  `runReminderSweep`. Each resolves the academy name + the recipients'
  tokens/emails on the **base connection** (via `getPushTargets` in
  `packages/db`), builds the message with the domain builders, and calls the
  transport. Routers just gather the affected student ids under the tenant seam
  and call these.

**Push tokens live OUTSIDE the tenant seam.** A push token is keyed to a
`user.id` — user-global identity, not academy-scoped. So `push_token` (migration
`0014`) carries **no `academy_id` and no RLS policy** (like the auth
`user`/`session` tables); only the base connection reads/writes it. Registration
is a `protectedProcedure` (`pushToken.register`/`unregister`) — authenticated but
NOT tenant-scoped, so it has no `ctx.db` and writes via a base-connection db
helper keyed by `ctx.session.user.id`. This is the same enumerated-exception
shape as the public drop-in writes ([25](25-dropin-lead-form.md), [12](12-tenant-isolation-mechanism.md)).

**Reminder cron: code now, schedule deferred.** The reminder sweep
(`claimDueReminderClasses` in `packages/db` claims classes atomically via a
`reminder_sent_at` NULL→now flip; `runReminderSweep` in `packages/api` sends) and
its protected route (`/api/cron/remind`) ship in Phase 4. The **frequent cron
entry** in `vercel.json` (a reminder ~2h before start needs a sub-daily cron /
Vercel Pro; the Hobby plan caps crons at 1/day) is deferred to the Phase 5
launch-infra task. Until then the route is exercised by a manual authenticated
`curl`. The materialization daily cron is unaffected.

**Env:** `RESEND_API_KEY`, `RESEND_FROM`, optional `EXPO_ACCESS_TOKEN` — all
**optional** (a `notificationsEnv()` preset extended into the Next.js env), so
builds/dev never fail unconfigured. Set them in the Vercel project to deliver
(like `CRON_SECRET`).

**Live push delivery is device-only** — it needs a real device + an EAS project
id, which land with the Phase 5 launch infra ([31](31-deep-link-approach.md)). The
full mobile pipeline (token registration on sign-in, tap-to-navigate) ships in
Phase 4; end-to-end push checks go on the mobile device-test checklist, like the
mobile pass. Email and the server logic are verifiable now.
