import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["import", "typescript", "unicorn"],
  env: { browser: true, es6: true },
  ignorePatterns: ["build/**", "node_modules/**"],
  options: {
    typeAware: true,
    typeCheck: true,
  },
  jsPlugins: ["@tanstack/eslint-plugin-query"],
  categories: {
    correctness: "warn",
  },
  rules: {
    "eslint/no-unused-vars": "error",
  },
});
