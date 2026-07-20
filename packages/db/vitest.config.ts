import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // PGlite boots a WASM Postgres on first use — give it headroom.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
