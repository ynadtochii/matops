# matops evidence map

Checked 2026-09-03. If a path or table looks stale, verify before relying on it.

## Debug-valuable tables (packages/db/src/)

| Table                                                               | Why it matters when debugging                                                                                                                                                                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notification`                                                      | The de facto delivery audit log. One row per recipient per event, written by the same `deliver()` choke point as the push. `kind`, `title`, `body`, `link`, `sent_by`, `created_at`, `read_at` (NULL = unread). Academy-scoped. |
| `push_token`                                                        | Expo tokens keyed by `user_id`. No RLS. First stop for "push did not arrive".                                                                                                                                                   |
| `member_dues`                                                       | One row per (academy, member). Status is derived from `next_due_at`, never stored. `dues_reminder_period` is the reminder idempotency claim: if it equals the current period, the reminder already went out.                    |
| `class`                                                             | Materialized class at a UTC instant. `booking_count` is denormalized and may exceed capacity. `reminder_sent_at` is the class-reminder idempotency claim.                                                                       |
| `class_participation`                                               | Unified booking + attendance row per (class, student).                                                                                                                                                                          |
| `payment_claim`                                                     | Student "I paid" claims. Amount and currency snapshotted at claim time. Partial unique index: one open claim per `period` ("YYYY-MM").                                                                                          |
| `member_referral_audit`                                             | Append-only referral history (assign / correct / clear).                                                                                                                                                                        |
| `rank_promotion`                                                    | Append-only belt-change history.                                                                                                                                                                                                |
| `drop_in`, `drop_in_visit`                                          | Visitor leads and their class visits. The debug role cannot read cancellation tokens.                                                                                                                                           |
| `_health`                                                           | Liveness probe rows. Check with `select count(*) from _health`; do not run `seed:health` against prod (it writes).                                                                                                              |
| `organization`, `entity`, `entity_membership`, `user`, `member`     | Better Auth identity plus the current organization and academy model. The debug role cannot read sessions or account credentials.                                                                                               |
| `curriculum_track`, `curriculum_block_template`, `curriculum_block` | One academy's curriculum tracks, reusable themes, and scheduled placements.                                                                                                                                                     |

`academy_id` is text (the Better Auth org id). Never cast it to uuid.

## Log prefixes (grep keys)

| Prefix                                 | Where emitted                                                     | Meaning                                                                          |
| -------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `[TRPC] <path> took Nms`               | packages/api/src/trpc.ts:126                                      | Timing for every tRPC call. Only source of latency data anywhere.                |
| `>>> tRPC Error on '<path>'`           | apps/nextjs/src/app/api/trpc/[trpc]/route.ts:39                   | Every tRPC error, including expected ones.                                       |
| `[notify] …`                           | packages/api/src/notify.ts:82,101,111                             | Inbox write / delivery / academy lookup failures. Swallowed, never reach Sentry. |
| `[notifications] …`                    | packages/notifications/src/expo-push.ts:70,76; resend.ts:27,49,54 | Expo push and Resend transport failures. Swallowed.                              |
| `[auth] magic link for <email>: <url>` | packages/auth/src/index.ts:165                                    | How you sign in locally.                                                         |
| `[seed] …`                             | packages/db/src/seed.ts                                           | Seed CLI output.                                                                 |

## Sentry coverage

- Org `matops`, project `javascript-nextjs`, region DE (`de.sentry.io`). DSN hardcoded in the three init files on purpose (ADR 72), not an env var.
- Holds errors and error-session-replays ONLY. `tracesSampleRate: 0`, `enableLogs: false`, `replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 1.0`. No performance data, no log data. ADR 72 describes higher rates than what actually shipped; the shipped config wins.
- What reaches it: `onRequestError` in apps/nextjs/src/instrumentation.ts (server components, middleware, route handlers), `app/error.tsx` + `global-error.tsx`, and the tRPC `onError` hook in the trpc route, which reports only `INTERNAL_SERVER_ERROR` and tags `trpcPath`, `trpcType`, `user.id`, `extra.academyId`.
- Blind spots (ADR 72, deliberate): `packages/api/src/notify.ts`, `packages/api/src/routers/payments.ts:482`, `packages/api/src/routers/referral.ts:221` swallow errors to `console.error`. Evidence for those lives only in Vercel logs. Expo has no Sentry at all.

## Production SQL boundary

`sql.sh` connects as `matops_debug_agent`, drops to `matops_debug_ro`, and sets the same transaction-local scope values as the app. Pass `--organization` for organization-shared tables and `--entity` for academy tables. Missing scope returns no rows. Credential tables and known secret columns have no grants.

## Cron

- One scheduled tick: `.github/workflows/cron.yml`, daily 09:00 Lisbon, calls `/api/cron/remind` only.
- `/api/cron/materialize` is NOT scheduled (ADR 79). Manual seam only.
- Routes log nothing; the JSON response body echoed in the workflow log is the record. `CRON_SECRET` is optional but guards both routes when set; they refuse to run unprotected in production.
