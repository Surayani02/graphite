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
  },
});
