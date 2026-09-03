import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // `@matops/db` builds its pg.Pool at import time. The pool is lazy and never
    // connects here: the tests inject `baseDb` on the tRPC context, and every
    // base-connection helper takes a REQUIRED `exec`, so nothing can silently
    // fall back to this URL. It only lets the import succeed. Same trick as
    // packages/db.
    env: { POSTGRES_URL: "postgres://api-test-dummy/db" },
    // PGlite boots a WASM Postgres on first use — give it headroom.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
