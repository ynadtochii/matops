import { withSentryConfig } from "@sentry/nextjs";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);

// Import env files to validate at build time. Use jiti so we can load .ts files in here.
await jiti.import("./src/env");

/** @type {import("next").NextConfig} */
const config = {
  /** Enables hot reloading for local packages without a build step */
  transpilePackages: [
    "@matops/api",
    "@matops/auth",
    "@matops/db",
    "@matops/ui",
    "@matops/validators",
  ],

  /** We already do linting and typechecking as separate tasks in CI */
  typescript: { ignoreBuildErrors: true },

  cacheComponents: true,
};

export default withSentryConfig(config, {
  org: "matops",
  project: "javascript-nextjs",

  silent: !process.env.CI,

  widenClientFileUpload: true,

  webpack: {
    automaticVercelMonitors: true,

    treeshake: {
      removeDebugLogging: true,
    },
  },
});
