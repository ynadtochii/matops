import nextPlugin from "@next/eslint-plugin-next";
import { defineConfig } from "eslint/config";

import { baseConfig, restrictEnvAccess } from "@matops/eslint-config/base";
import { designTokensConfig, reactConfig } from "@matops/eslint-config/react";

const nextjsConfig = defineConfig({
  files: ["**/*.ts", "**/*.tsx"],
  plugins: {
    "@next/next": nextPlugin,
  },
  rules: {
    ...nextPlugin.configs.recommended.rules,
    ...nextPlugin.configs["core-web-vitals"].rules,
    "@next/next/no-duplicate-head": "off",
  },
});

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
