---
name: debug
description: Evidence-first debugging for the matops stack (Next.js web, Expo app, tRPC, Neon Postgres, Sentry, Vercel, GitHub Actions cron). Use whenever something is broken, erroring, crashing, slow, missing, or behaving wrong, in production or dev. 500s, failed sign-ins, missing notifications or reminders, wrong data, cron failures, user bug reports, incidents, "why did X happen". Pulls real evidence from Sentry, the live database, Vercel logs, and cron run history before naming a cause.
---

# Debug (matops)

## The rule

Never diagnose from code alone. Before naming a cause, pull evidence from at least one real source below. Quote the evidence in your answer: the Sentry event id, the DB row, the log line, the cron run number. If no source can show the failure, say that explicitly instead of guessing.

Diagnosis is read-only. Report findings; a fix is a separate step the user approves.

## Triage: symptom → first source

| Symptom | Go to |
|---|---|
| Web error, 500, crash report | Sentry (org `matops`, project `javascript-nextjs`) |
| Notification / push / reminder did not arrive | DB: `notification`, `push_token`, then Vercel logs for `[notify]` / `[notifications]` (these paths swallow errors; Sentry never sees them) |
| Dues reminder / cron question | `gh run list --workflow=cron.yml`, then `gh run view <id> --log` |
| Slow request | Vercel logs, grep `[TRPC]` timing lines. Sentry has NO traces or logs (`tracesSampleRate: 0`), do not look there |
| Data looks wrong | Read-only SQL via `scripts/sql.sh` |
| Local dev problem | The `pnpm dev:next` terminal output (log prefixes in the reference file) |
| Mobile (Expo) crash | No source exists. Expo has no Sentry. Say so; ask for a device repro instead of guessing |
| Schema / migration doubt | `pnpm -F @matops/db check` (no DB connection needed) |
| Seed / demo data state | `pnpm -F @matops/db seed status <code>` |

## How to query each source

**Sentry.** Prefer the `mcp__sentry__*` MCP tools (`search_issues`, `search_events`, `get_sentry_resource`); fall back to the user-level `sentry-cli` skill. The app tags every tRPC server error with `trpcPath`, `trpcType`, `user.id`, and `extra.academyId`. Search by those. Only `INTERNAL_SERVER_ERROR` tRPC failures reach Sentry; expected errors (FORBIDDEN, BAD_REQUEST) do not.

**Database (live Neon, production data).** Only through the guard script, never raw `psql`:

```sh
sh .claude/skills/debug/scripts/sql.sh "select id, kind, created_at, read_at from notification order by created_at desc limit 20"
```

The script wraps your statement in `BEGIN READ ONLY`, so any write fails, and it connects to the **direct** (non `-pooler`) host. Never point a psql session at the `-pooler` host: PgBouncer shares one server connection between many clients, so a session-level `SET` from psql leaks into the app's own queries. A leaked read-only setting takes the whole app down for whichever database you are on. Since 2026-09-01 dev and production are separate Neon branches, so `POSTGRES_URL` in `.env` is the **dev** one; reaching production needs its own string, deliberately. This connection bypasses RLS: always filter by `academy_id` yourself, and never show one academy's data while discussing another.

**Vercel logs (prod runtime).** `vercel logs --json` from `apps/nextjs` (add `--follow` to stream). If `apps/nextjs/.vercel/project.json` is missing, do not fail around it: tell the user to run `vercel login` and `vercel link` in `apps/nextjs` once. Prod URL: `https://matops.app`.

**Cron.** History: `gh run list --workflow=cron.yml` and `gh run view <run-id> --log`. The routes log nothing; the evidence is the JSON response body echoed in the workflow log. Reproduce on demand: `curl -H "Authorization: Bearer $CRON_SECRET" https://matops.app/api/cron/remind`. Note `/api/cron/materialize` is not scheduled at all (ADR 79); the horizon is filled on template save and by the owner's Rebuild schedule button.

**Local dev.** Logs go only to the terminal running `pnpm dev:next`. If you own the process, capture output; otherwise ask the user to paste the lines around the failure.

## Detail map

Table purposes, every log prefix with its file, Sentry coverage and blind spots: read `references/evidence-map.md` in this skill's directory when you need them.
