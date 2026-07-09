import { test, expect } from "@playwright/test";
import { waitForShell } from "./helpers";

test.describe("editor shell", () => {
  test("renders the full chrome without a GPU (engine-error tolerant)", async ({ page }) => {
    await page.goto("/");
    await waitForShell(page);
    await expect(page.getByRole("toolbar", { name: "Tools" })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "Left panel" })).toBeVisible();
    await expect(page.getByText("Graphite")).toBeVisible();
  });

  test("left panel tabs switch between Layers and Assets", async ({ page }) => {
    await page.goto("/");
    await waitForShell(page);
    await page.getByRole("tab", { name: "Assets" }).click();
    await expect(page.getByRole("tab", { name: "Assets" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });
});
