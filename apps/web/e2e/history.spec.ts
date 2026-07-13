import { test, expect } from "@playwright/test";
import { MOD, openPalette, waitForShell } from "./helpers";

/**
 * Phase 7 M1 — the history command surface under the gate-zero contract.
 *
 * CI headless Chromium has no GPU (see helpers.waitForShell): the engine
 * settles into its error state, no document ever loads, and canUndo stays
 * false for the whole session. That makes the *enablement plumbing* the
 * honest thing to assert end-to-end here — a command whose `enabled` gate
 * is false must neither appear in the palette nor fire from its chord.
 * Real mutate→undo→redo behaviour is covered by the funnel integration
 * suite (src/__tests__/undoRedo.test.ts); a GPU-backed e2e environment is
 * an M5 workstream (ADR-020 §Deviations).
 */
test.describe("history (Phase 7 M1)", () => {
  test("undo/redo are gated out of the palette when there is nothing to undo", async ({ page }) => {
    await page.goto("/");
    await waitForShell(page);
    await openPalette(page);

    await page.getByRole("searchbox").fill("undo");
    await expect(page.getByRole("option", { name: /Undo/ })).toHaveCount(0);

    await page.getByRole("searchbox").fill("redo");
    await expect(page.getByRole("option", { name: /Redo/ })).toHaveCount(0);
  });

  test("mod+z / mod+shift+z with an empty history are safe no-ops", async ({ page }) => {
    await page.goto("/");
    await waitForShell(page);

    await page.keyboard.press(`${MOD}+z`);
    await page.keyboard.press(`${MOD}+Shift+z`);

    // Shell chrome intact, no crash overlay, no stray dialog.
    await waitForShell(page);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
