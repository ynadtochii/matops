import { defineConfig } from "eslint/config";

import { baseConfig } from "@matops/eslint-config/base";
import { designTokensConfig, reactConfig } from "@matops/eslint-config/react";

export default defineConfig(
  {
    ignores: ["dist/**"],
  },
  baseConfig,
  reactConfig,
  designTokensConfig,
);
