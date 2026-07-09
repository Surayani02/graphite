import { test, expect } from "@playwright/test";
import { waitForShell } from "./helpers";

test.describe("theming", () => {
  test("editor renders under the light theme", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Light", { exact: true }).click();
    await page.getByRole("link", { name: "Back to editor" }).click();
    await waitForShell(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("forced-colors mode renders the shell without breakage", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/");
    await waitForShell(page);
    // No assertion on specific colours (the OS drives them); the gate is that
    // chrome still renders and is operable under forced-colors.
    await expect(page.getByRole("tablist", { name: "Left panel" })).toBeVisible();
  });
});
