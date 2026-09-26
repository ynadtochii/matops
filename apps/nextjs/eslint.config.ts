import { defineConfig } from "eslint/config";

import { baseConfig, restrictEnvAccess } from "@matops/eslint-config/base";
import { nextjsConfig } from "@matops/eslint-config/nextjs";
import { designTokensConfig, reactConfig } from "@matops/eslint-config/react";

export default defineConfig(
  {
    ignores: [".next/**"],
  },
  baseConfig,
  reactConfig,
  nextjsConfig,
  restrictEnvAccess,
  designTokensConfig,
);
