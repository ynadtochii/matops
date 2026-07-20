# Auth Stack Research — matops (rebuild of MAT) (Next.js App Router + Expo/RN)

**Date:** 2026-07-20
**Question:** Which open, Postgres-backed auth solution best serves BOTH a Next.js (App Router) web app AND a native Expo / React Native app, under a strict "minimal vendor lock / portable" constraint? Clerk and proprietary auth SaaS in the critical path are ruled OUT.

## TL;DR

**Recommendation: Better Auth.** It is the only candidate that treats native Expo/RN as a first-class, documented target (dedicated `@better-auth/expo` plugin over `expo-secure-store`), stores all its tables in *your* Postgres via your own ORM/driver (zero lock-in), ships email/password + verification + reset + social login out of the box, and carries org/role membership natively via its Organization plugin — which maps almost 1:1 onto academy → member → role (owner/instructor/student). As of mid-2026 it is past 1.0 (stable line ~1.6.x), ~28k+ GitHub stars, YC-backed, and — decisively — the Better Auth team **took over maintenance of Auth.js/NextAuth in Sept 2025**, consolidating the ecosystem rather than fragmenting it.

## Comparison Table

| Solution | Native Expo/RN (decisive) | Portability / self-host (your Postgres) | Built-in email-pw + verify + reset + social | Multi-tenant org/role native | Maintenance / prod-readiness mid-2026 | Verdict |
|---|---|---|---|---|---|---|
| **Better Auth** | **First-class.** `@better-auth/expo` plugin: SecureStore-backed session cache, deep-link OAuth via app scheme, `trustedOrigins` | **Excellent.** Tables live in your own Postgres via Drizzle/Prisma/Kysely/pg. Just a connection string; no proprietary service in path | **Yes**, all built in | **Yes** — Organization plugin (orgs, members, invitations, RBAC owner/admin/member; dynamic roles) | Past 1.0, ~1.6.x stable + 1.7 beta; ~28k★, YC; now also maintains Auth.js; active security releases (June 2026) | **#1 — PICK** |
| Auth.js / NextAuth v5 | **Poor.** No first-class RN/Expo; community workarounds only. Cookie/web-first | Good (adapters to your Postgres) | Partial (social strong; email-pw is DIY/credentials) | No (bring your own authz) | v5 stuck in beta for years; lead left Jan 2025; **now maintained by Better Auth team, security-only** | Not for greenfield; superseded |
| Lucia | N/A | N/A | N/A (you build it) | No | **Deprecated.** Now an educational resource, not a package. Author builds sessions from scratch; points to Arctic/Oslo | Ruled out |
| Supabase Auth (GoTrue) | Workable (supabase-js + SecureStore) but web/RLS-centric | **Portable-ish but sticky.** Core is Postgres (pg_dump moves it), self-hostable — but RLS-as-authz + supabase-js become load-bearing; self-hosting the full stack (GoTrue/Kong/PostgREST/…) is operationally heavy | Yes | Partial — no native org model; you model tenants in tables + RLS | Mature, well-run | Viable fallback; more lock-in gravity than it looks |
| Ory Kratos | Good — headless native-flow APIs (no cookies/CSRF); official **RN/Expo reference app** | Good — self-host on Postgres/MySQL/CockroachDB | Yes (verify/recovery/MFA) | **No** — no multi-tenancy/B2B in OSS; you layer authz (or add Ory Keto) | Solid but composable; docs gaps; ops cost grows; you glue services | Overkill ops for a small team |
| Keycloak | OAuth PKCE via `expo-auth-session` works, but IdP-centric, not RN-native | Self-host on Postgres | Yes (full IdP) | Realms/roles exist but heavy for owner/instructor/student | Enterprise heavyweight; Java, real DevOps burden | Too heavy for a 2-person startup |
| Oslo / Arctic roll-your-own | Full control; you build SecureStore/refresh/deep-link yourself | Maximal portability (it's your code) | You build all of it | You build all of it | Libraries maintained (Lucia author); *your* auth is your burden | Only if you must; high risk/time |

## Per-Candidate Notes

### Better Auth — recommended
- **Mobile:** dedicated `@better-auth/expo` package. Client `expoClient({ scheme, storage: SecureStore, cookiePrefix })` caches session in encrypted `expo-secure-store` (iOS Keychain / Android Keystore). Server declares `trustedOrigins: ["myapp://", "myapp://*"]`. Deep-link OAuth handled by converting callback paths to deep links via `Linking.createURL` using the app scheme. Works for both native and Expo web.
- **Portability:** framework-agnostic TS library that talks to *your* database through your chosen adapter (Drizzle/Prisma/Kysely/raw pg). Postgres provenance is irrelevant (Supabase/Neon/Railway/self-hosted) — just a connection string. All tables (user, session, account, verification, organization, member, invitation) are yours; no external auth service in the request path. This directly satisfies the "minimal lock" constraint.
- **Features:** email/password, email verification, password reset, social/OAuth providers all built in.
- **Multi-tenant:** Organization plugin models orgs + members + invitations + RBAC natively; default roles owner/admin/member and supports dynamic/custom roles at runtime — so academy=organization, and owner/instructor/student are member roles. Authorization (can this instructor edit that class?) still lives in your app, but *membership + role* is carried by the library, saving the schema and invitation flows.
- **Health:** ~28k★, ~150k weekly npm downloads, YC batch, past 1.0 (stable ~1.6.x, 1.7 in beta), and took stewardship of Auth.js in Sept 2025. Active security cadence (dedicated security update June 2026) — a plus (they patch fast) and a caution (young project, security surface still hardening).

### Auth.js / NextAuth v5
Web-/cookie-first; **no first-class Expo/RN** — only community bridges (e.g. a Next.js server acting as an OAuth AS for the Expo app). v5 was stuck in beta since 2023; primary maintainer left Jan 2025; the **Better Auth team now maintains it in security-only mode** and explicitly steers new projects to Better Auth (except the one gap: stateless DB-less sessions). Not appropriate for a greenfield mobile+web build.

### Lucia
**Deprecated by the author.** Becoming a learning resource on implementing sessions from scratch, not an installable package; v3 got ~6 more months of maintenance. Author points people to Arctic/Oslo (his lower-level primitives) or to build it themselves. Do not adopt as a library.

### Supabase Auth (GoTrue)
Genuinely open-source and self-hostable, and because the core is Postgres you can `pg_dump` and move — the `auth.users` table, password hashes, and JWT secret travel with you. But the portability is stickier than it appears: RLS-as-authorization and `supabase-js` become load-bearing, and self-hosting the whole platform (GoTrue, Kong, PostgREST, Storage, Realtime, Studio) is operationally heavy. No native org/role model — you'd model tenants in tables + RLS. A credible fallback, but more gravitational pull than Better Auth for our "portable" goal.

### Ory Kratos
Strong on native: headless self-service **API flows that don't need cookies/CSRF**, plus an **official React Native / Expo reference app**. Self-hosts on Postgres. But OSS Kratos has **no multi-tenancy / B2B** and a thin admin story; you compose Kratos (+ Keto for authz) and glue services yourself. Ops cost and integration burden are high for a small team building a single SaaS.

### Keycloak
Battle-tested IdP; Expo works via OAuth2 Authorization Code + PKCE (`expo-auth-session`). But it's a Java enterprise heavyweight — real memory footprint, admin-console learning curve, Java SPIs for custom flows. Realm/role model is overkill for owner/instructor/student. Wrong weight class for a 2-person startup where infra competes with product.

### Oslo / Arctic roll-your-own
Maximum control and portability (it's your code, your tables), and the primitives are well maintained (same author as Lucia). But you own SecureStore integration, refresh rotation, deep-link OAuth, verification/reset emails, and the org/role schema — weeks of security-sensitive work Better Auth gives you for free. Only justified if a hard constraint rules out all frameworks.

## Top Pick — Concrete Expo Mobile Token Story (Better Auth)

**Packages** — server: `better-auth`, `@better-auth/expo`; Expo client: `better-auth`, `@better-auth/expo`, `expo-secure-store`, `expo-network` (+ `expo-linking`, `expo-web-browser`, `expo-constants` for social).

**Server (shared with Next.js):**
```ts
export const auth = betterAuth({
  database: /* your Postgres via Drizzle/Prisma/Kysely/pg */,
  emailAndPassword: { enabled: true },
  trustedOrigins: ["myapp://", "myapp://*"],   // deep-link schemes
  plugins: [ expo(), organization() ],
});
```

**Expo client:**
```ts
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";

export const authClient = createAuthClient({
  baseURL: "https://api.mat.app",
  plugins: [ expoClient({ scheme: "myapp", storage: SecureStore, cookiePrefix: "better-auth" }) ],
});
```

- **Secure storage:** the session token/cookie is persisted in `expo-secure-store` — iOS Keychain, Android Keystore-encrypted — NOT web cookies. Cached session removes the reload loading spinner.
- **Attaching auth:** the plugin auto-injects the stored cookie into `authClient` requests; for hand-rolled `fetch` to your API, pull it via `authClient.getCookie()` and set the `Cookie` header with `credentials: "omit"`.
- **Refresh / expiry:** session lifetime and refresh are governed server-side by Better Auth's session config; the SecureStore-cached session is validated/renewed against the server rather than trusting a long-lived client token.
- **Deep-link OAuth (social):** relative callbacks are converted to deep links via `Linking.createURL` using the registered app `scheme`; `trustedOrigins` must whitelist `myapp://` (and `exp://` wildcards in dev). This is the piece web-first libraries get wrong — Better Auth handles it natively.

## Where academy/role authorization should live

Split authentication from authorization:

1. **Authentication + membership/role storage → Better Auth (in your Postgres).** The Organization plugin owns `organization` (= academy), `member` (user↔academy with a `role`), and `invitation`. Roles owner/instructor/student are member roles; the invitation/onboarding flow is provided.
2. **Authorization (policy enforcement) → your application layer.** "Can this instructor edit *that* class?", "can a student only see their own attendance?" are domain rules. Read the caller's academy + role from the Better Auth session/membership, then enforce in a thin server-side policy layer (middleware/service functions, and optionally Postgres RLS as defense-in-depth). Better Auth's plugin has an access-control/permission system you can lean on for coarse role→permission checks, but resource-level, business-specific rules belong in your code so they stay testable and portable.

Net: Better Auth carries *who you are* and *which academy/role you hold*; matops owns *what that role may do* to specific resources.

## Biggest Risk / Tradeoff

Better Auth is young and moving fast. Upside: momentum, YC backing, and it now stewards Auth.js. Downside: pre-2.0 velocity means occasional breaking changes across minor lines (e.g. plugin deprecations slated for 1.7) and a still-hardening security surface — evidenced by a dedicated **security update in June 2026**. Mitigation: pin versions, watch the changelog/security advisories, keep the auth integration behind a thin internal module, and — because all data lives in *your* Postgres — retain a clean exit path (the portability that makes it the pick also caps the blast radius if you ever need to migrate).

## Sources
- Better Auth Expo integration docs — https://better-auth.com/docs/integrations/expo
- `@better-auth/expo` (npm) — https://www.npmjs.com/package/@better-auth/expo
- Better Auth Organization plugin — https://better-auth.com/docs/plugins/organization
- Better Auth repo (stars/status) — https://github.com/better-auth/better-auth
- "Auth.js is now part of Better Auth" (Sept 22 2025) — https://better-auth.com/blog/authjs-joins-better-auth ; https://github.com/nextauthjs/next-auth/discussions/13252
- Better Auth security update, June 2026 — https://better-auth.com/blog/security-update-june-2026
- Better Auth vs Clerk vs NextAuth vs Supabase (2026) — https://makerkit.dev/blog/tutorials/better-auth-vs-clerk
- Lucia deprecation / future plans (author) — https://github.com/lucia-auth/lucia/discussions/1707
- Supabase self-hosting Auth (GoTrue) — https://supabase.com/docs/reference/self-hosting-auth/introduction ; restore-from-platform — https://supabase.com/docs/guides/self-hosting/restore-from-platform
- Ory Kratos RN/Expo reference app — https://github.com/ory/kratos-selfservice-ui-react-native ; Ory Kratos alternatives/limitations — https://www.descope.com/blog/post/ory-kratos-alternatives
- Keycloak + Expo PKCE — https://rene-wilby.de/en/blog/rn-expo-oauth-authorization-code-flow-pkce-keycloak/ ; self-hosted auth comparison 2026 — https://supertokens.com/blog/self-hosted-auth-solutions-in-2026
- LogRocket: RN auth with Better Auth + Expo — https://blog.logrocket.com/react-native-authentication-with-better-auth-and-expo/
