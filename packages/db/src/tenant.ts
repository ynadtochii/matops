import { sql } from "drizzle-orm";

import { db } from "./client";

/** Restricted, non-BYPASSRLS role the request transaction runs as. */
export const APP_ROLE = "matops_app";
/** Transaction-local GUC that the RLS policies read. */
export const TENANT_GUC = "app.academy_id";

// The role name is a constant we control, but assert its shape so it can never
// become an injection vector if someone later makes it configurable (it is
// interpolated raw below — an identifier cannot be a bound parameter).
if (!/^[a-z_][a-z0-9_]*$/.test(APP_ROLE)) {
  throw new Error(`Unsafe APP_ROLE: ${APP_ROLE}`);
}

/** The RLS-scoped transaction handle a tenant resolver runs on (`ctx.db`). */
export type TenantTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Run `fn` inside a transaction scoped to one academy.
 *
 * It drops to the restricted role and sets `app.academy_id` — BOTH
 * transaction-local (`SET LOCAL ROLE` / `set_config(..., true)`), so they reset at
 * COMMIT and never leak to a reused pooled connection (safe under Neon
 * transaction-mode pooling). Postgres RLS then filters every statement `fn` runs
 * on `tx`, so app queries stay plain Drizzle and cannot leak across academies.
 *
 * academyId is the Better Auth organization id (text). See
 * docs/architecture.md §5 and docs/issues/12-tenant-isolation-mechanism.md.
 */
export async function withTenant<T>(
  academyId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  if (!academyId) throw new Error("withTenant: academyId is required");
  return db.transaction(async (tx) => {
    // Identifier → must be raw (constant, shape-checked above). Value → bound param.
    await tx.execute(sql`SET LOCAL ROLE ${sql.raw(APP_ROLE)}`);
    await tx.execute(sql`SELECT set_config(${TENANT_GUC}, ${academyId}, true)`);
    return fn(tx);
  });
}
