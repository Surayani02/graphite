import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@graphite/protocol": resolve(import.meta.dirname, "../../packages/protocol/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/__tests__/**/*.test.ts", "src/__tests__/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["src/**/*.{ts,tsx}"],
      // Excluded with cause (ADR-022): the GPU pipeline cannot execute
      // without WebGPU (e2e territory), main.tsx is render bootstrap, and
      // the rest are test scaffolding / ambient types. The worker
      // dispatcher, camera, and input handlers stay IN — they are
      // unit-testable, and low numbers there are honest signal.
      exclude: [
        "src/__tests__/**",
        "src/test-setup.ts",
        "src/**/*.d.ts",
        "src/main.tsx",
        "src/workers/engine/gpu/**",
      ],
      // Regression floors from measured actuals (2026-07-14: statements
      // 71.87, branches 70.23, functions 73.47, lines 71.31) minus a ~3 pt
      // churn margin — see ADR-022. Raise these as coverage rises; never
      // lower them to admit a regression.
      thresholds: {
        statements: 68,
        branches: 67,
        functions: 70,
        lines: 68,
      },
    },
    benchmark: {
      include: ["src/__tests__/**/*.bench.ts"],
    },
  },
});
