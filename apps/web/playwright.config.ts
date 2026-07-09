import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config (M5). Runs against `vite preview` on a built app, so the
 * suite exercises the real production bundle (including the settings lazy
 * chunk and the compiled theme blocks), not the dev server.
 *
 * Chromium only: the shell must render without WebGPU (CI headless has none)
 * — every spec asserts chrome/palette/settings/theming, never canvas pixels,
 * so one engine is sufficient and cross-browser rendering is out of scope
 * for a UI-shell gate. `webServer` builds then previews; CI reuses the same.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm build && pnpm preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
