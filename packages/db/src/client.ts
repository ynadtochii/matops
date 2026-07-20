import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const connectionString = process.env.POSTGRES_URL;
if (!connectionString) {
  throw new Error("Missing POSTGRES_URL");
}

/**
 * node-postgres `Pool` on the Neon `-pooler` endpoint.
 *
 * We use the `pg` driver (NOT the HTTP driver) on purpose: the tenant seam runs
 * every request inside an interactive transaction that calls
 * `set_config('app.academy_id', …, true)` for RLS. The HTTP driver cannot do
 * interactive transactions. See docs/issues/21-neon-connection-model.md and
 * docs/issues/15-api-deployment-shape.md.
 *
 * The pool is exported so the tenant seam (slice 0.3) can check out a client and
 * open its own transaction; app code should use the `db` helper below.
 */
export const pool = new Pool({
  connectionString,
  // Neon requires TLS; the connection string carries `sslmode=require`.
});

export const db = drizzle({
  client: pool,
  schema,
  casing: "snake_case",
});
