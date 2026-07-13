import { test, expect } from "@playwright/test";
import { waitForShell } from "./helpers";

test.describe("settings route", () => {
  test("navigates to /settings and back without booting the editor engine", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Keyboard shortcuts" })).toBeVisible();
    // The editor canvas must NOT exist on this route — proof the worker is
    // editor-scoped (ADR-017).
    await expect(page.getByRole("region", { name: "Graphite canvas" })).toHaveCount(0);

    await page.getByRole("link", { name: "Back to editor" }).click();
    await waitForShell(page);
  });

  test("theme preference applies live and persists across reload", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Light", { exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByRole("radio", { name: /Light/ })).toBeChecked();
  });

  test("keymap editor lists commands and search filters them", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("option", { name: /Save Document(?! As)/ })).toBeVisible();
    await page.getByRole("searchbox", { name: "Keyboard shortcuts" }).fill("ellipse");
    await expect(page.getByRole("option", { name: /Ellipse Tool/ })).toBeVisible();
    await expect(page.getByRole("option", { name: /Save Document(?! As)/ })).toBeHidden();
  });
});
