import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";

export const reactConfig = defineConfig(
  {
    files: ["**/*.ts", "**/*.tsx"],
    ...reactPlugin.configs.flat.recommended,
    ...reactPlugin.configs.flat["jsx-runtime"],
    languageOptions: {
      ...reactPlugin.configs.flat.recommended?.languageOptions,
      ...reactPlugin.configs.flat["jsx-runtime"]?.languageOptions,
      globals: {
        React: "writable",
      },
    },
  },
  reactHooks.configs.flat["recommended-latest"]!,
);

const ARBITRARY_TEXT_SIZE = String.raw`/(^|[\s:])text-\[[0-9.]+(px|rem|em)?\]/`;
const ARBITRARY_HEX = String.raw`/-\[#[0-9a-fA-F]{3,8}\]/`;
const TEXT_SIZE_MESSAGE =
  "Use a text size token (text-2xs to text-6xl), not an arbitrary size. See ADR 141.";
const HEX_MESSAGE =
  "Use a color token (bg-surface-1, text-muted-foreground, ...), not a hex value. See ADR 141.";

export const designTokensConfig = defineConfig({
  files: ["**/*.ts", "**/*.tsx"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: `Literal[value=${ARBITRARY_TEXT_SIZE}]`,
        message: TEXT_SIZE_MESSAGE,
      },
      {
        selector: `TemplateElement[value.raw=${ARBITRARY_TEXT_SIZE}]`,
        message: TEXT_SIZE_MESSAGE,
      },
      {
        selector: `Literal[value=${ARBITRARY_HEX}]`,
        message: HEX_MESSAGE,
      },
      {
        selector: `TemplateElement[value.raw=${ARBITRARY_HEX}]`,
        message: HEX_MESSAGE,
      },
    ],
  },
});
