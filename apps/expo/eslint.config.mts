import { defineConfig } from "eslint/config";

import { baseConfig } from "@matops/eslint-config/base";
import { reactConfig } from "@matops/eslint-config/react";

export default defineConfig(
  {
    ignores: [".expo/**", "expo-plugins/**"],
  },
  baseConfig,
  reactConfig,
);
