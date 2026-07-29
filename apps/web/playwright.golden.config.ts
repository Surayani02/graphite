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
 * WebGPU is configured differently in CI and locally, on purpose.
 *
 * **CI** runs software WebGPU (SwiftShader): runners have no GPU, and
 * software rasterisation is identical across machines, which is what a
 * pixel comparison needs. Baselines come from here and nowhere else.
 *
 * **Locally** those same flags yield *no adapter at all* on a developer
 * machine — SwiftShader for WebGPU is not available in the bundled
 * Chromium on every platform — so every test skips and the suite cannot be
 * debugged where iteration is fast. Local runs therefore use the real GPU,
 * headed, because headless Chromium's GPU support varies by platform and
 * version while a headed window's does not.
 *
 * This means a local run can produce *different pixels* from CI. That is
 * fine and expected: Playwright suffixes snapshots per platform, so a
 * local baseline never satisfies CI, and local runs exist to prove the
 * mechanism — loading, zooming, skipping — not to bless images.
 *
 * If the adapter is unavailable anyway, the spec skips loudly rather than
 * passing silently (ADR-032's requirement).
 */
const isCI = Boolean(process.env.CI);
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
    // `on-first-retry` with `retries: 0` means never — traces have not been
    // captured on any run of this suite, which is why several CI failures
    // had to be diagnosed from a bare error string. Retain on failure.
    trace: "retain-on-failure",
    video: isCI ? "retain-on-failure" : "off",
    headless: isCI,
    launchOptions: {
      args: isCI
        ? [
            "--enable-unsafe-webgpu",
            "--use-webgpu-adapter=swiftshader",
            "--use-angle=swiftshader",
            "--enable-features=Vulkan",
          ]
        : ["--enable-unsafe-webgpu"],
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
