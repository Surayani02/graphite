import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.ts"],
      // index.ts is the logic-free public barrel (re-exports only);
      // tests import the modules directly, so counting the barrel
      // would report 0% on zero executable logic.
      exclude: ["src/__tests__/**", "src/index.ts"],
      // Floors from the measured actuals at extraction (PC-1, 2026-07-25)
      // minus a ~3 pt churn margin — same discipline as apps/web
      // (ADR-022): raise as coverage rises, never lower to admit a
      // regression. Measured at extraction: statements 93.07, branches
      // 88.00, functions 100, lines 95.15. (Some error branches are
      // additionally exercised by the worker suites in apps/web, which no
      // longer count here — system-wide coverage is unchanged, only
      // partitioned.)
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 97,
        lines: 92,
      },
    },
    benchmark: {
      include: ["src/__tests__/**/*.bench.ts"],
    },
  },
});
