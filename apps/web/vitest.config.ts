import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@graphite/protocol": resolve(import.meta.dirname, "../../packages/protocol/src/index.ts"),
      "@graphite/ui-core": resolve(import.meta.dirname, "../../packages/ui-core/src/index.ts"),
      "@graphite/crdt": resolve(import.meta.dirname, "../../packages/crdt/src/index.ts"),
      "@graphite/plugin-api": resolve(
        import.meta.dirname,
        "../../packages/plugin-api/src/index.ts"
      ),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts", "src/__tests__/**/*.test.tsx"],
  },
});
