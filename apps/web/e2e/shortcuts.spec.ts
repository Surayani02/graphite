import { test, expect } from "@playwright/test";
import { openPalette, waitForShell } from "./helpers";

test.describe("remappable shortcuts", () => {
  test("rebinding a shortcut persists across reload", async ({ page }) => {
    await page.goto("/");
    await waitForShell(page);

    // Open the recorder via the palette entry.
    await openPalette(page);
    await page.getByRole("searchbox").fill("change keyboard");
    await page.getByRole("option", { name: /Change Keyboard Shortcut/ }).click();

    const dialog = page.getByRole("dialog", { name: "Change keyboard shortcut" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Command").selectOption("tool.rectangle");
    await dialog.getByLabel("New shortcut").press("q");
    await dialog.getByRole("button", { name: "Save" }).click();

    // The new binding works.
    await page.keyboard.press("q");
    await expect(page.getByRole("button", { name: "Rectangle" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // And survives a reload (persisted to localStorage).
    await page.reload();
    await waitForShell(page);
    await page.getByRole("button", { name: "Select" }).click();
    await page.keyboard.press("q");
    await expect(page.getByRole("button", { name: "Rectangle" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });
});
