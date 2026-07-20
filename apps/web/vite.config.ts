import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

// GitHub Pages serves a *project* page under /<repo>/, so production assets
// and routes must be prefixed with "/graphite/". Local dev and preview stay
// at "/". CI sets DEPLOY_TARGET=gh-pages for the Pages build; nothing else
// does, so `pnpm dev` / `pnpm preview` are unaffected. The router reads the
// same value via import.meta.env.BASE_URL (see src/router.ts).
const base = process.env.DEPLOY_TARGET === "gh-pages" ? "/graphite/" : "/";

export default defineConfig({
  base,

  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@graphite/protocol": resolve(import.meta.dirname, "../../packages/protocol/src/index.ts"),
      "@graphite/ui-core": resolve(import.meta.dirname, "../../packages/ui-core/src/index.ts"),
      "@graphite/crdt": resolve(import.meta.dirname, "../../packages/crdt/src/index.ts"),
      "@graphite/plugin-api": resolve(
        import.meta.dirname,
        "../../packages/plugin-api/src/index.ts"
      ),
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
