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
    benchmark: {
      include: ["src/__tests__/**/*.bench.ts"],
    },
  },
});
