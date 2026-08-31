<!-- matops — delivery & living-spec system (the rulebook). Pairs with roadmap.md (the live plan). -->
# matops — Delivery system & living specs

> **What this file is.** The rulebook for *how we build and how the docs stay true* — not the plan itself.
> The plan (phases, slices, live status) is in [roadmap.md](roadmap.md). This file changes rarely; roadmap.md changes every session.

The project is big and built by one person with coding agents. The risk is not "can we build it" — it is **drift**: code moves, specs rot, and after two months nobody (human or agent) can trust the docs. This system exists to stop that. The core rule:

> **A change is not done until the doc that describes it is true again.**

---

## 1. The four altitudes (what each doc owns)

Every fact lives in exactly **one** place. If you need it in two places, one is a pointer, not a copy.

| Altitude | Doc | Owns | Changes when |
|---|---|---|---|
| **WHAT / WHY (product)** | [spec.md](spec.md) | User-visible behavior, flows, screens, rules. Every rule has an ID (`S1`, `O4`…). | Product scope changes. |
| **HOW (design of record)** | [architecture.md](architecture.md) | System shape: stack, tenancy seam, data flow, deploy topology, expansion seams. | A technical approach changes. |
| **WHY-we-chose (history)** | `docs/issues/` (ADRs — the wayfinder tickets) | One decision per file, append-only. The 27 tickets ARE the ADR set. | Never rewritten; superseded by a *new* ADR that links back. |
| **EXECUTION (the work)** | [roadmap.md](roadmap.md) | Phases, slices, and the live **scope matrix**. Maps spec IDs → concrete work. | Every build session. |

**Rule of one:** capacity policy lives in spec.md (behavior) + one ADR (why). The router just *implements* it. If they disagree, spec.md wins and the code is a bug.

---

## 2. Scope tracking — the surface matrix

You asked for a way to hold scope across **BE + FE + app + …**. The unit is the **slice** (a thin vertical feature). Every slice is tracked across six **surfaces**:

| Surface | Means | Lives in |
|---|---|---|
| **DB** | Drizzle schema + migration | `packages/db` |
| **API** | tRPC router + auth/RLS + pure domain logic | `packages/api`, `packages/domain` |
| **Web** | Next.js owner/instructor app | `apps/nextjs` |
| **Mobile** | Expo student app | `apps/expo` |
| **Shared** | validators, notifications, UI tokens | `packages/{validators,notifications,ui}` |
| **Infra** | Neon, Vercel, EAS, cron, CI | `tooling/`, host configs |

Each cell is one of: **`—`** not needed · **`todo`** · **`wip`** · **`done`**.
The matrix in roadmap.md is the single answer to *"what is left, and on which surface?"*

---

## 3. The slice — the unit of work AND of spec-keeping

A slice is small, vertical, and shippable: it touches whatever surfaces it needs (usually DB → API → Web/Mobile) and delivers one testable behavior. Big features are cut into several slices.

Each slice in roadmap.md is one block:

```
### 2.3 Class instances — create / edit / cancel
Spec: O-classes, §4 edit-rules, ticket 19        <- traceability up to the spec
Surfaces: DB done · API wip · Web todo · Mobile — · Shared — · Infra —
Tasks:
  - [ ] edit rule: notify booked students on time/instructor change
  - [ ] template edit → future non-cancelled instances only
Done-check: DoD §4 satisfied
```

**Traceability both ways.** The slice names the spec IDs it builds (up). Each spec rule can be found in exactly one slice (down). So you can always answer *"is rule S5 built?"* and *"why does this code exist?"*.

---

## 4. Definition of Done (the anti-drift gate)

A slice flips to **`done`** only when **all** of these are true — this is the mechanism that keeps specs alive:

1. **Code** merged across its surfaces; typecheck + lint clean.
2. **Migration** written and applied (if DB changed).
3. **Tests** for the domain rule pass (pure logic in `packages/domain` first).
4. **Spec synced** — if real behavior differs from spec.md, edit spec.md **in the same change**. No "I'll fix the doc later."
5. **Architecture synced** — if a technical decision was made or changed, edit architecture.md **and** add/append an ADR in `decisions/`.
6. **Matrix flipped** in roadmap.md + one line in the **CHANGELOG**.

If steps 4–6 feel like a chore, that is the point: the doc-update is cheap only when done immediately, and expensive (drift) when deferred.

---

## 5. The per-slice loop (what a build session actually runs)

This is the order an agent or you follows inside one slice. It puts pure logic and the spec first, UI last.

1. **Read** the spec IDs + ADRs the slice names. Restate the behavior in one sentence.
2. **Schema** — adjust `packages/db`, generate the migration. **Structure only**: tables, columns, indexes, constraints, RLS policies, grants. If the slice needs existing rows filled or corrected, that is a separate hand-run script in `packages/db/scripts/`, never part of the migration. A migration runs everywhere and forever; a data fill is usually right once, on one database.
3. **Domain** — pure functions in `packages/domain` (no I/O) + unit tests. The booking rule, the approval rule, etc.
4. **API** — the tRPC procedure (right tier) that calls domain + scoped db.
5. **Clients** — web and/or mobile UI on top of the procedure.
6. **Verify** — tests green, one manual end-to-end pass.
7. **Sync docs + matrix + changelog** (DoD 4–6).

---

## 6. Making the docs persistent memory for agents

Because this is agentic-coding-first, the rulebook has to be *loaded automatically*, not remembered by a human. The **repo-root `CLAUDE.md`** carries this so every session reads it:

```md
## Specs are the source of truth
- Product behavior: docs/spec.md (rules have IDs: S1, O4…).
- System design: docs/architecture.md.
- Decisions: docs/issues/*.md (ADRs, append-only; supersede, never rewrite).
- Live plan + scope matrix: docs/roadmap.md.

## Definition of Done (every slice)
Code + migration + tests, THEN: update spec.md if behavior changed,
update architecture + add/append an ADR if a decision changed,
flip the roadmap matrix, add a CHANGELOG line. A slice is not done until its doc is true.

## Before building
Read the spec IDs and ADRs the slice names. If reality must differ from the spec,
change the spec in the same PR — do not silently diverge.
```

**Where the docs live** (promoted from `.scratch/matops-mvp/` into the repo in slice 0.1, so they version with code — layout kept flat to preserve the tickets' cross-links):

```
matops/
  CLAUDE.md                  # loads the rules above every session
  CHANGELOG.md               # one line per shipped slice
  docs/
    spec.md                  # product behavior (IDs: S1, O4…)
    architecture.md          # system design of record
    roadmap.md               # live plan + scope matrix
    delivery.md              # this file — the rulebook
    map.md                   # wayfinder decision map (index of the ADRs)
    issues/NN-*.md           # the 27 ADRs (decision records)
    research/*.md            # deep-dive research reports
    assets/schema-draft.ts   # reference schema → becomes packages/db
```

---

## 7. Two guardrails

- **No silent scope creep.** New idea mid-build → it is a new slice in roadmap.md (or an ADR), not a quiet addition. The "next iteration" list (hard caps, waitlists, no-shows, widget) stays parked until promoted on purpose.
- **ADRs are append-only.** Changed your mind on tenancy? Write a new ADR that says "supersedes NNNN" and edit architecture.md. The old ADR stays as history — that trail is why the tickets already carry "⚠ refined by…" notes instead of overwrites.
