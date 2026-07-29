import { defineConfig, devices } from "@playwright/test";

/**
 * Visual-golden config — Net 2 of the M1 golden strategy (ADR-032).
 *
 * A separate config rather than a project in `playwright.config.ts`,
 * because the two suites need incompatible servers: the shell suite runs
 * against `vite preview` on a production build, while the path fixture
 * corpus is DEV-gated (ADR-027) and only exists on the dev server. Folding
 * them together would make every shell run pay for a second server, and
 * would make it easy to forget why the golden specs cannot use the
 * production URL.
 *
 * Chromium is launched with software WebGPU: CI runners have no GPU, and
 * SwiftShader gives deterministic output across machines — which is what a
 * pixel comparison needs. If the adapter is unavailable anyway, the spec
 * skips loudly rather than passing silently (ADR-032's requirement).
 */
export default defineConfig({
  testDir: "./e2e-golden",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // No retries: a flaky pixel comparison is a finding, not something to
  // paper over by running it again.
  retries: 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:5174",
    trace: "on-first-retry",
    launchOptions: {
      args: [
        "--enable-unsafe-webgpu",
        "--use-webgpu-adapter=swiftshader",
        "--use-angle=swiftshader",
        "--enable-features=Vulkan",
      ],
    },
  },
  expect: {
    toHaveScreenshot: {
      // 1% of pixels may differ. Tessellation is exact and MSAA resolve is
      // deterministic on a fixed adapter, so the tolerance exists for
      // driver-level rounding rather than for geometry drift — a real
      // geometry change moves far more than 1% of a shape's pixels, and
      // Net 1's Rust snapshots catch it exactly anyway.
      maxDiffPixelRatio: 0.01,
    },
  },
  projects: [{ name: "golden", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev --port 5174 --strictPort",
    url: "http://localhost:5174",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
