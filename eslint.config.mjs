import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

/** Rules from obsidianmd that require @typescript-eslint parser type information. */
const obsidianTypedRulesOff = {
  "obsidianmd/no-plugin-as-component": "off",
  "obsidianmd/no-view-references-in-plugin": "off",
  "obsidianmd/no-unsupported-api": "off",
  "obsidianmd/prefer-file-manager-trash-file": "off",
  "obsidianmd/prefer-instanceof": "off",
};

export default defineConfig([
  {
    ignores: [
      "dist/**",
      "release/**",
      "node_modules/**",
      "graph-analysis-wasm/**",
      "scripts/**",
      "obsidian-releases-fork/**",
      "versions.json",
      "LICENSE",
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts", "manifest.json"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.eslint.json" },
    },
    rules: {
      "obsidianmd/ui/sentence-case": [
        "warn",
        { allowAutoFix: true, enforceCamelCaseLower: true },
      ],
    },
  },
  {
    files: [
      "eslint.config.mjs",
      "**/*.mjs",
      "**/*.cjs",
      "package.json",
    ],
    rules: obsidianTypedRulesOff,
  },
]);
