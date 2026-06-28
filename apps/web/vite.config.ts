import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      // TypeScript packages → resolve to source for instant HMR
      "@graphite/protocol": resolve(import.meta.dirname, "../../packages/protocol/src/index.ts"),
      "@graphite/ui-core": resolve(import.meta.dirname, "../../packages/ui-core/src/index.ts"),
      "@graphite/crdt": resolve(import.meta.dirname, "../../packages/crdt/src/index.ts"),
      "@graphite/plugin-api": resolve(
        import.meta.dirname,
        "../../packages/plugin-api/src/index.ts"
      ),
      // WASM package → resolve to the wasm-pack JS glue output
      "@graphite/engine": resolve(
        import.meta.dirname,
        "../../packages/engine/pkg/graphite_engine.js"
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
      ignored: ["!**/node_modules/@graphite/**"],
    },
  },
});
