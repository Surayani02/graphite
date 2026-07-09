import { test, expect } from "@playwright/test";
import { MOD, openPalette, waitForShell } from "./helpers";

test.describe("command palette", () => {
  test("opens, filters, and executes a command", async ({ page }) => {
    await page.goto("/");
    await waitForShell(page);
    await openPalette(page);
    await page.getByRole("searchbox").fill("assets");
    await expect(page.getByRole("option", { name: /Go to Assets/ })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("tab", { name: "Assets" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  test("Escape clears the query first, then closes (two-stage)", async ({ page }) => {
    await page.goto("/");
    await waitForShell(page);
    await openPalette(page);
    await page.getByRole("searchbox").fill("save");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("searchbox")).toHaveValue("");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("opens in under 150ms (CI gate; reference target is <50ms)", async ({ page }) => {
    await page.goto("/");
    await waitForShell(page);
    // Instrumentation ships in the app: openPalette marks start, CommandPalette
    // measures to the first painted frame. Trigger, then read the measure.
    await page.keyboard.press(`${MOD}+k`);
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
    const durations = await page.evaluate(() =>
      performance.getEntriesByName("graphite:palette-open").map((e) => e.duration)
    );
    expect(durations.length).toBeGreaterThan(0);
    expect(Math.min(...durations)).toBeLessThan(150);
  });
});
