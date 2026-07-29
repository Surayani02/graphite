import { expect, test, type Page } from "@playwright/test";
import { waitForShell } from "../e2e/helpers";

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

/** Page errors and console errors seen since navigation, so a failure
 *  reports the cause instead of a bare timeout. */
const pageErrors = new WeakMap<Page, string[]>();

function watchForErrors(page: Page): void {
  const seen: string[] = [];
  pageErrors.set(page, seen);
  page.on("pageerror", (error) => seen.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") seen.push(`console.error: ${message.text()}`);
  });
}

/** Everything the shell is currently saying — engine status included. */
async function shellText(page: Page): Promise<string> {
  return (await page.locator("body").innerText()).replace(/\s+/gu, " ").trim();
}

async function loadFixtures(page: Page): Promise<void> {
  // No navigation here — `beforeEach` already loaded `/?pathFixtures`, the
  // DEV-only entry point (useEngine.ts) that builds the corpus once the
  // engine is running. Navigating again would boot a second engine and
  // tear down the first, whose death notice lands in the live page's
  // status bar.
  await waitForShell(page);

  // The status bar reports the framing zoom once the worker has applied
  // it, which is also the signal that the corpus is built and a frame has
  // been rendered. Wrapped so a failure carries the diagnosis: the zoom
  // span only renders while the engine status is "running", so an engine
  // error inside the fixture build looks identical to a missing element
  // from the outside.
  const expected = `zoom ${String(Math.round(FIXTURE_ZOOM * 100))}%`;
  try {
    await expect(page.getByText(expected)).toBeVisible({ timeout: 15_000 });
  } catch (error) {
    const errors = pageErrors.get(page) ?? [];
    throw new Error(
      [
        `Fixture corpus did not load — never saw "${expected}".`,
        `Shell text: ${await shellText(page)}`,
        `Page errors: ${errors.length > 0 ? errors.join(" | ") : "(none)"}`,
        (error as Error).message,
      ].join("\n"),
      { cause: error }
    );
  }
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
    // The adapter probe used to navigate to "/" and `loadFixtures` then
    // navigated again. Two navigations means two engine boots, and the
    // first one's teardown emitted "GPU lost (destroyed)" into the second
    // page's status — which is exactly what CI reported. One navigation,
    // and the probe runs against the page under test.
    watchForErrors(page);
    await page.goto("/?pathFixtures");
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

  test("the corpus actually renders, and differs across tolerance buckets", async ({ page }) => {
    // A pixel baseline is only as good as the frame it was blessed from,
    // and the worst failure mode is a blank canvas: `--update-snapshots`
    // would enshrine emptiness and every later run would agree with it.
    // Two captures at different buckets must differ — which is false for a
    // blank canvas, false for a frozen first frame, and true only if
    // something was drawn and re-tessellated. No image decoder needed.
    await loadFixtures(page);
    const canvas = page.getByRole("region", { name: "Graphite canvas" });
    const atFit = await canvas.screenshot();
    await zoomTo(page, FIXTURE_ZOOM, 3);
    const atThreeX = await canvas.screenshot();

    expect(atFit.byteLength).toBeGreaterThan(0);
    expect(atThreeX.byteLength).toBeGreaterThan(0);
    expect(Buffer.compare(atFit, atThreeX)).not.toBe(0);
  });
});
