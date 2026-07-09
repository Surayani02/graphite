import { type Page, expect } from "@playwright/test";

/** mod key label for this OS — Playwright's Meta on macOS, Control elsewhere. */
export const MOD = process.platform === "darwin" ? "Meta" : "Control";

/**
 * The shell renders even without WebGPU: CI headless Chromium has no GPU, so
 * the engine settles into its error state. Specs wait for chrome to exist,
 * never for a running engine. This helper is the gate-zero contract in code.
 */
export async function waitForShell(page: Page): Promise<void> {
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("region", { name: "Graphite canvas" })).toBeVisible();
}

/** Opens the command palette via its shortcut and waits for the dialog. */
export async function openPalette(page: Page): Promise<void> {
  await page.keyboard.press(`${MOD}+k`);
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
}
