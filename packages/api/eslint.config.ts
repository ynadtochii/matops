import { defineConfig } from "eslint/config";

import { baseConfig } from "@matops/eslint-config/base";

export default defineConfig(
  {
    ignores: ["dist/**"],
  },
  baseConfig,
  {
    // Tenant-seam guardrail (docs/issues/33). Routers must NEVER import the raw
    // owner `db` from `@matops/db/client` — that connection bypasses RLS. They
    // use `ctx.db` (the RLS-scoped transaction from the tenant middleware) or a
    // domain-scoped db helper. The raw handle is reserved for `trpc.ts` (the
    // seam itself), the auth package, migrations, and the materialization cron.
    files: ["src/router/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@matops/db/client",
              message:
                "Routers must not use the RLS-bypassing owner connection. Use ctx.db (the tenant-scoped tx) or a db helper. See docs/issues/33.",
            },
          ],
        },
      ],
    },
  },
);
