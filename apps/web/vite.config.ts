import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

/**
 * Vite configuration for apps/web.
 *
 * Key decisions:
 *
 * 1. `resolve.alias` — maps all @graphite/* workspace packages to their
 *    TypeScript source files. This means Vite/esbuild compiles them
 *    in-process, giving us instant HMR without a separate `tsc --watch`
 *    step for packages.
 *
 * 2. `worker.format = "es"` — engine workers will use native ES module
 *    workers (added in Phase 1).
 *
 * 3. `server.watch.ignored` — un-ignores node_modules/@graphite/** so Vite
 *    picks up changes to workspace packages when they ARE compiled
 *    separately (e.g., Turborepo watch mode in later phases).
 */
export default defineConfig({
  plugins: [react()],

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

  worker: {
    format: "es",
  },

  build: {
    target: "esnext",
    sourcemap: true,
  },

  server: {
    watch: {
      // Allow Vite to pick up changes inside @graphite/* packages.
      ignored: ["!**/node_modules/@graphite/**"],
    },
  },
});
