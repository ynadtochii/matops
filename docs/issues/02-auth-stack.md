# 02 — Auth stack for web + Expo mobile

Type: research
Status: resolved
Blocked by: —

## Question

Which **open, Postgres-backed** auth solution serves both a Next.js web app and a native Expo/React Native app, under the portability constraint (Clerk is out)?

Research the current (2026) landscape and their tradeoffs specifically for:
- **Native mobile support** — token/session handling in Expo (secure storage, refresh), not just web cookies.
- **Portability / self-hostability** — owns its tables in *our* Postgres; no proprietary lock.
- **Social + email/password**, email verification, password reset out of the box.
- **Multi-tenant fit** — a user belongs to an academy with a role; how does the auth layer carry org/role, or do we layer that ourselves?

Candidates to evaluate: **Better Auth**, **Auth.js (NextAuth v5)**, **Lucia** (check its maintenance status — was slated for deprecation), **Supabase Auth** (portable? or lock?), **Ory / Keycloak** (self-hosted, heavier), a minimal **Oslo/Arctic**-based roll-your-own.

Output: a ranked recommendation with the mobile-token story spelled out for the top pick, and a note on where academy/role authorization lives relative to authentication.

## Answer

**Chosen: Better Auth.** Full report: [research/auth-stack.md](../research/auth-stack.md).

Ranked: 1) Better Auth · 2) Supabase Auth (portable-but-sticky fallback) · 3) Ory Kratos (native-capable, ops-heavy) · 4) Keycloak (overkill). Ruled out: Auth.js/NextAuth v5 (web-first, no first-class Expo, now security-only maintenance), Lucia (deprecated → now a learning resource, author points to Arctic/Oslo), full roll-your-own (weeks of security-sensitive work, no gain).

Why Better Auth:
- **Expo is a documented first-class target** — `@better-auth/expo` persists the session in `expo-secure-store` (iOS Keychain / Android Keystore), auto-attaches it to requests; deep-link social OAuth via app `scheme` + server `trustedOrigins`. Session lifetime/refresh validated server-side (no long-lived client token).
- **Zero lock** — all tables live in our Postgres via our own ORM/driver.
- **Multi-tenant native** — the Organization plugin carries academy → member → role (owner/instructor/student). We layer only resource-level authorization on top → ties directly into [05 multi-tenancy](05-multitenancy-model.md).

**Risk:** Better Auth is young/fast-moving (pre-2.0, stable ~1.6.x, plugin deprecations in 1.7, a June 2026 security patch) — occasional breaking changes. Mitigated by data staying in our Postgres (clean exit).

**Authorization vs authentication:** Better Auth provides authN + org/role membership; the academyId-scoped resource authorization is ours to own in the tenancy seam ([05](05-multitenancy-model.md)).
