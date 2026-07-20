import type { Config } from "drizzle-kit";

if (!process.env.POSTGRES_URL) {
  throw new Error("Missing POSTGRES_URL");
}

/**
 * Migrations (DDL) run against Neon's DIRECT (non-pooled) endpoint. At runtime the
 * app uses the `-pooler` endpoint (see src/client.ts); for schema changes we strip
 * `-pooler` so DDL runs on a plain session connection.
 */
const migrationUrl = process.env.POSTGRES_URL.replace("-pooler", "");

export default {
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: migrationUrl },
  casing: "snake_case",
} satisfies Config;
