import { defineConfig } from "vitest/config";

/**
 * Every export in this package is a React component, so — unlike
 * apps/web, which is mostly pure logic with a handful of component tests
 * opted into jsdom per-file — jsdom is the sensible *default* environment
 * here rather than a per-file docblock repeated in every test file.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/__tests__/**/*.test.ts", "src/__tests__/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/__tests__/**", "src/test-setup.ts"],
      // Regression floors from measured actuals (2026-07-14: statements
      // 79.33, branches 73.07, functions 83.63, lines 81.02) minus a ~3 pt
      // churn margin — see ADR-022.
      thresholds: {
        statements: 76,
        branches: 70,
        functions: 80,
        lines: 78,
      },
    },
  },
});
