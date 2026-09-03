---
name: matops-debug
description: Diagnose MatOps production and development problems from real evidence in Neon Postgres, Sentry, Vercel, and GitHub Actions. Use when MatOps data is wrong or missing, a request fails, a job does not run, or the user asks what happened in the live app.
---

# MatOps debug

Diagnose from real evidence. Do not name a cause from code alone when a live source can confirm it.

Diagnosis is read-only. Report the cause and evidence. Do not edit data or deploy a fix unless the user separately asks.

## Pick the first source

| Symptom                          | First source                                             |
| -------------------------------- | -------------------------------------------------------- |
| Wrong or missing app data        | Production Neon through the guarded SQL helper           |
| Web error or 500                 | Sentry org `matops`, project `javascript-nextjs`         |
| Missing notification or reminder | Neon `notification` and `push_token`, then Vercel logs   |
| Cron failure                     | GitHub Actions workflow `cron.yml`                       |
| Slow request                     | Vercel `[TRPC]` timing logs                              |
| Local development failure        | The `pnpm dev:next` terminal                             |
| Mobile crash                     | Ask for a device reproduction because Expo has no Sentry |

Read [references/evidence-map.md](references/evidence-map.md) only when you need table names, log prefixes, or source limits.

## Query production Neon

Use only this helper from the MatOps repository root:

```sh
sh .claude/skills/debug/scripts/sql.sh --entity <entity-id> "select id, name from curriculum_block_template order by created_at desc"
```

Add `--organization <organization-id>` for `entity` and `entity_membership` queries. Most BJJ tables need `--entity`. Use both when a query joins organization-level and entity-level tables.

The helper uses the dedicated `matops_debug_agent` Neon login and the `matops_debug_ro` role. It cannot write. It applies MatOps row-level security, uses a read-only transaction, rejects multiple statements, times out after 10 seconds, and returns at most 100 rows unless a smaller or larger limit is requested.

Rules:

- Never use `POSTGRES_URL`, raw `psql`, Drizzle Studio, or the Neon owner login for production diagnosis.
- Select only the columns needed to answer the question.
- Start with a narrow time range or exact record id.
- Use `--limit` only when 100 rows are not enough. The maximum is 500.
- Do not show email addresses, phone numbers, bank details, notes, or other private data unless the question requires that exact value.
- Never print, inspect, or return the database connection string.
- If the helper reports missing credentials or roles, stop. Read [references/database-setup.md](references/database-setup.md) and tell the user which setup step is missing.
- Quote the target, row ids, timestamps, and relevant field values in the finding.
- If the query returns no evidence, say so. Do not guess.

Useful sequence for an entity-scoped issue:

1. Get the entity id from the app URL, Sentry event, or user report.
2. Query the smallest table that records the action.
3. Join related tables only if the first query leaves more than one cause possible.
4. Compare the stored state with the code path that reads or writes it.
5. Report the cause, evidence, and confidence.

## Other sources

Use Sentry tools when available. Search by `trpcPath`, `trpcType`, `user.id`, and `extra.academyId`. Expected tRPC errors do not reach Sentry.

Run Vercel log commands from the repository root. The linked project is `matops-nextjs`. Notification transport failures are swallowed and exist only in these logs.

For cron history, use `gh run list --workflow=cron.yml`, then `gh run view <run-id> --log`. The JSON response in the workflow log is the record.
