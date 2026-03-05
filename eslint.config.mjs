import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  { ignores: ["dist/**", "release/**", "node_modules/**", "graph-analysis-wasm/**", "scripts/**"] },
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: "./tsconfig.json" },
      globals: {
        document: "readonly",
        window: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        getComputedStyle: "readonly",
        performance: "readonly",
      },
    },
    rules: {
      "obsidianmd/ui/sentence-case": ["warn", { allowAutoFix: true }],
    },
  },
]);
