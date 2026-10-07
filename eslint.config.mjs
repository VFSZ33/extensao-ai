import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import perfectionist from "eslint-plugin-perfectionist";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

import importsConfig from "#eslint/imports";

export default defineConfig([
  globalIgnores([
    ".husky/_/**",
    ".output/**",
    ".wxt/**",
    "playwright-report/**",
    "test-results/**",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    extends: [
      react.configs.flat.recommended,
      react.configs.flat["jsx-runtime"],
      reactHooks.configs.flat.recommended,
    ],
    files: ["**/*.{ts,tsx}"],
    settings: { react: { version: "detect" } },
  },
  perfectionist.configs["recommended-alphabetical"],
  importsConfig,
  prettier,
]);
