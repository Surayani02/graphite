import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { waitForShell } from "./helpers";

/**
 * Automated accessibility gate (M5): axe-core across each route × theme.
 * Zero serious/critical violations is a Phase 6 exit criterion. The manual
 * protocol (keyboard-only walkthrough, NVDA smoke, contrast verification)
 * lives in docs/architecture/phase-6-a11y-audit.md and is executed on the
 * reference machine — axe catches machine-detectable failures, not all of
 * WCAG.
 */
async function scan(page: import("@playwright/test").Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical"
  );
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test.describe("accessibility — no serious/critical violations", () => {
  test("editor, dark", async ({ page }) => {
    await page.goto("/");
    await waitForShell(page);
    await scan(page);
  });

  test("editor, light", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Light", { exact: true }).click();
    await page.getByRole("link", { name: "Back to editor" }).click();
    await waitForShell(page);
    await scan(page);
  });

  test("settings, dark", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
    await scan(page);
  });

  test("command palette, dark", async ({ page }) => {
    await page.goto("/");
    await waitForShell(page);
    await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
    await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
    await scan(page);
  });
});
