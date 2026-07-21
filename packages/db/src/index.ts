export * from "drizzle-orm/sql";
export { alias } from "drizzle-orm/pg-core";

// Tenant seam (RLS): withTenant(academyId, fn) — see ./tenant.ts.
export * from "./tenant";
// Membership lookup for the tRPC tenant middleware — see ./membership.ts.
export * from "./membership";
// Invite-link helpers (shareable per-role links) — see ./invite.ts.
export * from "./invite";
// Class materialization (templates → concrete classes) — see ./materialize.ts.
export * from "./materialize";
