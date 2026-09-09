import { sql } from "drizzle-orm";

import type { db, DbExec } from "./client";

export type { DbExec } from "./client";

/** Restricted, non-BYPASSRLS role the request transaction runs as. */
export const APP_ROLE = "matops_app";
/**
 * Transaction-local GUCs the RLS policies read (ADR 124 §3).
 *
 * `ENTITY_GUC` is still spelled `app.academy_id` in Postgres on purpose: every
 * policy written since migration `0001` reads that name, and renaming it is 77
 * references for no behaviour change. It now holds an ENTITY id.
 */
export const ORGANIZATION_GUC = "app.organization_id";
export const ENTITY_GUC = "app.academy_id";

// The role name is a constant we control, but assert its shape so it can never
// become an injection vector if someone later makes it configurable (it is
// interpolated raw below — an identifier cannot be a bound parameter).
if (!/^[a-z_][a-z0-9_]*$/.test(APP_ROLE)) {
  throw new Error(`Unsafe APP_ROLE: ${APP_ROLE}`);
}

/** The RLS-scoped transaction handle a tenant resolver runs on (`ctx.db`). */
export type TenantTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Any handle a READ may run on: the base connection or an open tenant
 * transaction. The identity tables (`user` / `member` / `organization`) carry no
 * RLS policy and `matops_app` keeps SELECT on them (migration 0020 revokes only
 * writes), so a read of those tables is identical on either handle.
 *
 * It matters which one a caller picks. Inside a tenant transaction the base
 * connection is a SECOND checkout from the same pool, held for as long as the
 * transaction it is nested inside — so N concurrent requests can hold N
 * connections while each waits for one more. Reads inside a tenant resolver take
 * `ctx.db`; only pre-transaction lookups and identity WRITES take the base
 * connection.
 */
export type DbReader = DbExec | TenantTx;

/**
 * Either handle, for a WRITE that runs on whichever one the caller opened. The
 * tenant tables the pivot added (`entity`, `academy_profile`) carry a policy and
 * a full `matops_app` grant, so their writes belong on the scoped transaction
 * where RLS is a second line of defence, not on the base connection that
 * `organization` and `member` are stuck with (ADR 124, docs/architecture.md §5).
 */
export type DbWriter = DbExec | TenantTx;

/** What a request transaction is scoped to. An organization read omits the entity. */
interface Scope {
  organizationId: string;
  entityId?: string;
}

/**
 * Run `fn` inside a transaction scoped to one organization and, when given, one
 * entity.
 *
 * It drops to the restricted role and sets the GUCs — ALL transaction-local
 * (`set_config(..., true)`), so they reset at COMMIT and never leak to a reused
 * pooled connection (safe under Neon transaction-mode pooling). Postgres RLS
 * then filters every statement `fn` runs on `tx`, so app queries stay plain
 * Drizzle and cannot leak across organizations or entities.
 *
 * `SET LOCAL ROLE x` is defined as `SET LOCAL role = x`, so the role goes
 * through set_config too and the whole scope fits in one round trip (ADR 81).
 *
 * Omitting `entityId` leaves `app.academy_id` unset, so every entity policy
 * matches nothing and an organization transaction cannot read entity rows by
 * accident. See docs/architecture.md §5 and docs/issues/124.
 */
export async function withScope<T>(
  scope: Scope,
  fn: (tx: TenantTx) => Promise<T>,
  exec: DbExec,
): Promise<T> {
  const { organizationId, entityId } = scope;
  if (!organizationId) throw new Error("withScope: organizationId is required");
  if (entityId === "") throw new Error("withScope: entityId cannot be empty");
  return exec.transaction(async (tx) => {
    await tx.execute(
      entityId
        ? sql`SELECT set_config(${ORGANIZATION_GUC}, ${organizationId}, true), set_config(${ENTITY_GUC}, ${entityId}, true), set_config('role', ${APP_ROLE}, true)`
        : sql`SELECT set_config(${ORGANIZATION_GUC}, ${organizationId}, true), set_config('role', ${APP_ROLE}, true)`,
    );
    return fn(tx);
  });
}
