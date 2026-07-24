import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // The seed CLI/run modules import `./client`, whose `pg.Pool` needs a
    // connection string at construction. It is LAZY (never connects), and seed
    // tests inject a PGlite handle — so a dummy URL just lets the import succeed.
    env: { POSTGRES_URL: "postgres://seed-test-dummy/db" },
    // PGlite boots a WASM Postgres on first use — give it headroom.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
