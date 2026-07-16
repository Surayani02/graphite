import { test, expect } from "@playwright/test";
import { openPalette, waitForShell } from "./helpers";

/**
 * Phase 7 M4 — export under the gate-zero contract.
 *
 * Same reality as file.spec.ts: CI Chromium has no GPU, the engine settles
 * into its error state, and export.svg gates on BOTH status === "running"
 * and hasContent — neither holds without a live worker broadcasting the
 * document. What e2e can honestly assert is the gating reaching the
 * palette. SVG correctness is pinned by the golden-document unit suite
 * (export-svg.test.ts + export-bounds.test.ts), and the save picker cannot
 * be driven headlessly regardless of GPU.
 */
test.describe("export (Phase 7 M4)", () => {
  test("export commands are gated out of the palette while the engine is down", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForShell(page);
    await openPalette(page);

    await page.getByRole("searchbox").fill("export");
    await expect(page.getByRole("option", { name: /Export/ })).toHaveCount(0);
  });
});
