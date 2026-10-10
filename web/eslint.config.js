import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "node_modules",
      "src/data/api-schema.d.ts",
      "e2e/.dist",
      "playwright-report",
      "test-results",
      // Wrangler's local state and temporary Worker bundles (wrangler pages dev / deploy).
      ".wrangler",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  reactHooks.configs.flat.recommended,
  {
    files: ["**/*.{ts,tsx,js}"],
    languageOptions: { globals: globals.browser },
    rules: {
      // Parameters required by an interface but not used yet are prefixed with _.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
