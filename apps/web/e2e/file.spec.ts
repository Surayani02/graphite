import { test, expect } from "@playwright/test";
import { MOD, openPalette, waitForShell } from "./helpers";

/**
 * Phase 7 M2 — the file command surface under the gate-zero contract.
 *
 * Same reality as history.spec.ts: CI Chromium has no GPU, the engine
 * settles into its error state, and every file command gates on
 * status === "running" (nothing to serialise, nothing to load into). What
 * this suite can honestly assert end-to-end is that the gating reaches
 * the UI — commands absent from the palette, the toolbar Save disabled —
 * and that the chords are safe no-ops. Real save/open/dirty behaviour is
 * covered by FilesProvider.test.tsx and gateway.test.ts against injected
 * gateways (pickers cannot be driven headlessly regardless of GPU).
 */
test.describe("files (Phase 7 M2)", () => {
  test("file commands are gated out of the palette while the engine is down", async ({ page }) => {
    await page.goto("/");
    await waitForShell(page);
    await openPalette(page);

    for (const query of ["save", "open document", "new document"]) {
      await page.getByRole("searchbox").fill(query);
      await expect(page.getByRole("option", { name: /Document/ })).toHaveCount(0);
    }
  });

  test("the toolbar Save is disabled and the file chords are safe no-ops", async ({ page }) => {
    await page.goto("/");
    await waitForShell(page);

    await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();

    await page.keyboard.press(`${MOD}+o`);
    await page.keyboard.press(`${MOD}+Shift+s`);

    await waitForShell(page);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("an untouched session shows Untitled with no dirty dot", async ({ page }) => {
    await page.goto("/");
    await waitForShell(page);
    await expect(page.getByText("Untitled")).toBeVisible();
    await expect(page.getByTitle("Unsaved changes")).toHaveCount(0);
  });
});
