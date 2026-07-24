import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@graphite/protocol": resolve(import.meta.dirname, "../../packages/protocol/src/index.ts"),
      "@graphite/document-model": resolve(
        import.meta.dirname,
        "../../packages/document-model/src/index.ts"
      ),
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
      // Regression floors from measured actuals minus a ~3 pt churn margin
      // — see ADR-022. Raise these as coverage rises; never lower them to
      // admit a regression. Re-based at PC-1 (ADR-030, 2026-07-25) when the
      // document model — the app's best-covered module family — moved to
      // @graphite/document-model, which enforces its own floors: the
      // partition changed this suite's denominator, not any line's
      // coverage. Measured after extraction: statements 69.14, branches
      // 64.55, functions 72.59, lines 68.62 (previous basis 2026-07-14:
      // 71.87 / 70.23 / 73.47 / 71.31).
      thresholds: {
        statements: 66,
        branches: 61,
        functions: 69,
        lines: 65,
      },
    },
    benchmark: {
      include: ["src/__tests__/**/*.bench.ts"],
    },
  },
});
