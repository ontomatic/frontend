import { defineConfig } from "oxfmt";

export default defineConfig({
  printWidth: 120,
  ignorePatterns: ["dist/**", "node_modules/**"],
  sortImports: true,
  sortTailwindcss: true,
});
