# 149 · Gym creation is invite-only

**Status:** accepted (built) · **Date:** 2026-09-30 · **Area:** `packages/auth` (`src/index.ts`, `env.ts`), `packages/domain` (`gym-creator.ts`), `apps/nextjs` (`start/page.tsx`, `sign-in/page.tsx`, `_components/landing.tsx`, `_components/contact.ts`, `sitemap.ts`)

## Context

Anyone could sign in and create a gym. The operator wants to pick the first academies by hand: to know who uses the database and to agree on payment with each gym before it starts. Hiding the `Start a gym` link was not enough. Better Auth's organization plugin serves `POST /api/auth/organization/create` to any signed-in user, so a gym could be made without the button.

## Decision

1. **An allowlist in an env var.** `GYM_CREATOR_EMAILS` holds comma-separated emails. The match ignores case and spaces. Unset or empty means nobody can create a gym. The rule is `canCreateGym` in `packages/domain/src/gym-creator.ts`.
2. **The check runs in Better Auth**, as `allowUserToCreateOrganization`. That one place covers both the tRPC `organization.create` (which calls `createOrganization`) and the raw auth endpoint. `entity.create` needs an organization owner, so it needs no second check.
3. **The UI matches the rule.** `/start` shows "MatOps is invite-only for now" with a Request access email link to a signed-in user who is not listed and owns no gym. The landing page and sign-in page show Request access instead of Start a gym. `/start` left the sitemap. The operator sends the `/start` link to each invited owner.
4. **No `organizationLimit`.** Better Auth counts every organization the user is a member of, so it could block an invited owner who already trains somewhere.

## Consequences

- Adding a gym means editing the env var in Vercel and redeploying, a few minutes. If that gets slow, a table the operator writes with psql can replace the env var behind the same `canCreateGym` call.
- Local dev and Preview need the operator's email in `GYM_CREATOR_EMAILS` to test `/start`. Seeds write academies directly and are not affected.
- A user who signs in first and is added later just reloads `/start`; no data changes.
- When MatOps charges for gyms, the same hook can allow "paid or listed".
- The router tests use a fake `authApi`, so they do not run this hook. The rule is covered by `packages/domain/test/gym-creator.test.ts`.
