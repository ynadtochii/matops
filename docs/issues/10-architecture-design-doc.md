# 10 — Architecture design doc (expandability synthesis)

Type: grilling
Status: resolved
Blocked by: 01, 02, 03, 04, 05, 06, 07, 08

## Question

Synthesize every locked decision into the **architecture design doc** — the second destination deliverable — with the "simple now, expandable without a major refactor" constraint as its spine.

Pull together: API contract + runtime ([01](01-api-contract-and-runtime.md)), auth ([02](02-auth-stack.md)), DB layer ([03](03-postgres-access-layer.md)), realtime ([04](04-realtime-strategy.md)), tenancy seam ([05](05-multitenancy-model.md)), hosting ([06](06-hosting-topology.md)), monorepo/shared packages ([07](07-monorepo-structure.md)), and the MVP schema ([08](08-mvp-domain-model.md)).

Then answer the expandability question explicitly: **where do the deferred domains plug in** (billing, curriculum/games, comms/DMs, belts) so adding them is additive, not a refactor? Define the domain seams, the API-versioning stance, and the module boundaries — this is where the map's fog ("expansion seams") graduates into concrete guidance.

Output: `architecture.md` — the design of record: stack, layer diagram, the tenancy/domain/policy seams, the shared-package dependency rules, deployment topology, and a section per deferred domain showing its future plug-point. Should read like a doc a build team starts from on day one.

## Answer

Delivered: **[architecture.md](../architecture.md)** — the design of record.

Synthesizes all 9 stack/decision tickets + the schema into: principles (portability · expandable · DX · agentic-first), the stack table, the create-t3-turbo monorepo layout, the request lifecycle (auth → tenant middleware → scopedDb → Drizzle/Neon), the tenancy seam + deletion test, web/mobile auth flows + additive-only contract discipline, the materialization engine + transactional booking, deployment topology + escape hatches, and cross-cutting engineering (migrations, testing incl. cross-tenant leak suite, guardrails).

**The expandability answer (§8):** every deferred domain — billing, curriculum/games, comms, belts, real-time, tiers, hard isolation — is **additive** (new schema file + router + optional pure logic), with a stated rule: if adding a domain forces edits to the tenancy seam or existing tables, the seam is wrong. That's the "simple now, expandable without major refactor" spine made concrete.
