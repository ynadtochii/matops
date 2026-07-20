# 16 — Class materialization job: scheduler + scaling

Type: grilling
Status: resolved
Blocked by: 15, 21

## Question

**Refines [08](08-mvp-domain-model.md).** The daily job that turns recurring `class_template` rows into concrete `class` rows was specified as a Vercel Cron endpoint. The review found two problems: (1) a serverless function has a **max-duration ceiling**, and iterating every template across every academy will eventually exceed it ("keep scalable" was a goal); (2) the scheduler choice depends on the deployment shape ([15](15-api-deployment-shape.md)).

Decide the mechanism and the scaling shape:
1. **Scheduler:** Vercel Cron (if in-Next) vs a worker on the standalone service vs Neon **pg_cron** vs an external queue (e.g. Inngest/QStash) — informed by [15](15-api-deployment-shape.md) and the connection model ([21](21-neon-connection-model.md)).
2. **Scaling:** batch/paginate templates per invocation; make the job idempotent and resumable (cursor `generated_until`); bound per-run work so it never approaches the duration limit; consider per-academy fan-out.
3. **Trigger vs schedule:** also materialize lazily on template create/edit so new schedules appear immediately, with the cron only extending the horizon.

Output: the chosen scheduler, the batching/idempotency design, and how it stays within limits as academy count grows.

## Answer

**Vercel Cron (daily) + lazy materialization on template write + a bounded, resumable, idempotent batch.** No queue, no pg_cron, no standalone worker for v1.

### Two triggers
1. **Lazy (on write):** when an owner creates/edits a template, materialize its near-term instances **right then** (in the same request), so new classes appear immediately. No waiting for the cron.
2. **Scheduled (extend horizon):** a **Vercel Cron**, daily, hits a protected endpoint that pushes every active template's concrete classes out to `now + HORIZON` (~6 weeks). Because lazy materialization keeps templates current, each cron run does tiny work (≈ +1 day per template).

### Why it never hits the serverless duration ceiling
The job is idempotent gap-fill, so it is **chunked and resumable**:
- Process templates **stale-first** — ordered by `generated_until` ASC — with a `LIMIT` (e.g. 200) **and** a soft time budget (stop at ~60s of the Fluid-compute budget).
- Whatever isn't finished is picked up on the next tick; `generated_until` is the cursor, `UNIQUE(template_id, starts_at)` makes re-runs safe. So a run always finishes fast; catch-up is spread across ticks. Increase cron frequency (e.g. hourly) if the backlog ever grows.

### Cross-academy execution (RLS interaction)
The cron is a **system job**, not a per-academy request, so it runs **outside the tenant seam** under a trusted **service role** (an enumerated, server-only exception to RLS — [12](12-tenant-isolation-mechanism.md)), writing classes for each template's own `academy_id`. Request handlers never use this role. This mirrors the old app's small `global*` allowlist idea.

### Timezone
Per-occurrence UTC instant computed from the template's local `starts_at_minutes` + IANA `time_zone`, DST-aware, in `packages/domain` (pure, testable).

### Not for v1 (upgrade path)
- **External queue (QStash/Inngest)** or **per-academy fan-out** — only if template volume grows enough that even chunked ticks lag. Additive.
- **Standalone worker / pg_cron** — reconsider only alongside the realtime worker ([04](04-realtime-strategy.md)); avoided now to keep one deploy and no DB-embedded logic.
- **Optional:** a light `booking_count` reconciliation pass (recompute from participations — [13](13-booking-write-atomicity.md)) can piggyback on the same cron.

**Refines** [08](08-mvp-domain-model.md): materialization is lazy-on-write + a bounded resumable daily cron under a service role.
