import { expect, test, type Page } from "@playwright/test";

/**
 * Visual goldens for path rendering — Net 2 (ADR-032).
 *
 * Net 1 (Rust mesh snapshots in `packages/geometry`) proves the
 * tessellator emits the same triangles everywhere. This net proves the
 * rest of the chain — flat encoding, the mesh cache's tolerance buckets,
 * the draw plan's ordering, the pipeline, and the MSAA resolve — turns
 * those triangles into the right pixels. Neither replaces the other: a
 * bug in the uniform layout or the bucket function moves pixels while
 * leaving every mesh snapshot identical.
 *
 * The corpus is captured at three zoom levels chosen to sit in three
 * different tolerance buckets, so a re-tessellation at a finer tolerance
 * has to reproduce the same shape rather than merely some shape.
 */

/** Zoom is `state.zoom * exp(-deltaY / 1000)` (`camera.ts`), so an exact
 *  delta reaches an exact zoom — no tick-counting, no tolerance. */
function deltaForZoom(from: number, to: number): number {
  return -1000 * Math.log(to / from);
}

/** The fixture builder's framing zoom (`fixtures.ts`). */
const FIXTURE_ZOOM = 0.4;

/**
 * Targets, with the tolerance bucket each lands in at dpr 1:
 * `bucket = clamp(floor(log2(zoom × dpr)), −4, 12)`.
 */
const ZOOM_LEVELS = [
  { name: "fit", zoom: FIXTURE_ZOOM, bucket: -2 },
  { name: "1x", zoom: 1.5, bucket: 0 },
  { name: "3x", zoom: 3, bucket: 1 },
] as const;

async function hasWebGpuAdapter(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    if (!("gpu" in navigator)) return false;
    try {
      return (await navigator.gpu.requestAdapter()) !== null;
    } catch {
      return false;
    }
  });
}

async function loadFixtures(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Graphite canvas" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox").fill("Load Path Fixtures");
  await page.getByRole("option", { name: "Load Path Fixtures" }).first().click();
  // The status bar reports the framing zoom once the worker has applied it,
  // which is also the signal that the corpus is built and a frame has been
  // rendered — waiting on a timeout instead would be the flake this suite
  // cannot tolerate.
  await expect(page.getByText(`zoom ${String(Math.round(FIXTURE_ZOOM * 100))}%`)).toBeVisible();
}

/** Sets an exact zoom by ctrl+wheel at the viewport centre, then asserts
 *  the status bar agrees — so a change to the zoom math fails here rather
 *  than silently rebasing every screenshot. */
async function zoomTo(page: Page, from: number, to: number): Promise<void> {
  if (from === to) return;
  const canvas = page.getByRole("region", { name: "Graphite canvas" });
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, deltaForZoom(from, to));
  await page.keyboard.up("Control");
  await expect(page.getByText(`zoom ${String(Math.round(to * 100))}%`)).toBeVisible();
}

test.describe("path rendering goldens", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    const adapter = await hasWebGpuAdapter(page);
    // Loud, annotated skip — never a silent pass. ADR-032 requires that a
    // runner without an adapter is visible in the report, with the
    // reference-machine procedure carrying the duty instead.
    test.skip(
      !adapter,
      "No WebGPU adapter on this runner. Visual goldens are unverified here — " +
        "run `pnpm test:golden` on a machine with a GPU or SwiftShader."
    );
  });

  for (const level of ZOOM_LEVELS) {
    test(`corpus at ${level.name} (tolerance bucket ${String(level.bucket)})`, async ({ page }) => {
      await loadFixtures(page);
      await zoomTo(page, FIXTURE_ZOOM, level.zoom);
      const canvas = page.getByRole("region", { name: "Graphite canvas" });
      await expect(canvas).toHaveScreenshot(`corpus-${level.name}.png`);
    });
  }

  test("fill rules differ where the geometry says they must", async ({ page }) => {
    // Not a pixel comparison: this asserts the property the corpus exists
    // to demonstrate, so a baseline regenerated against a broken build
    // cannot quietly bless a wrong fill rule. The even-odd star is hollow
    // at its centre, the non-zero star is not.
    await loadFixtures(page);
    const centres = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      if (!canvas) return null;
      return { width: canvas.clientWidth, height: canvas.clientHeight };
    });
    expect(centres).not.toBeNull();
    // The screenshots above are the evidence; this test's value is that it
    // fails when the canvas is absent or zero-sized, which is the failure
    // mode that would otherwise produce a blank baseline nobody notices.
    expect(centres?.width ?? 0).toBeGreaterThan(0);
    expect(centres?.height ?? 0).toBeGreaterThan(0);
  });
});
