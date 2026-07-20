export * from "drizzle-orm/sql";
export { alias } from "drizzle-orm/pg-core";

// Tenant seam (RLS): withTenant(academyId, fn) — see ./tenant.ts.
export * from "./tenant";
// Membership lookup for the tRPC tenant middleware — see ./membership.ts.
export * from "./membership";
