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

/** The fixture builder's framing zoom — must match `FIXTURE_ZOOM` in
 *  `workers/engine/scene/fixtures.ts`. Duplicated rather than imported:
 *  importing from the worker tree would pull the engine into the spec's
 *  module graph. The assertion on the status bar catches a mismatch
 *  immediately, so the duplication cannot drift silently. */
const FIXTURE_ZOOM = 0.3;

/**
 * Targets, with the tolerance bucket each lands in at dpr 1:
 * `bucket = clamp(floor(log2(zoom × dpr)), −4, 12)`.
 */
const ZOOM_LEVELS = [
  // Whole corpus: every shape, every fill rule, the stroke matrix, and the
  // alternating strip that exercises draw-plan interleaving.
  { name: "fit", zoom: FIXTURE_ZOOM, bucket: -2 },
  // Zoomed captures show only what falls under the (unchanged) camera
  // centre — in practice a donut arc. That is the point rather than a
  // limitation: they exist to prove re-tessellation at a finer tolerance
  // produces a smoother curve, and a curve is what they need to contain.
  // Shape *coverage* is the fit capture's job.
  { name: "1x", zoom: 1.5, bucket: 0 },
  { name: "3x", zoom: 3, bucket: 1 },
] as const;

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

/** What the app told us after loading `/?pathFixtures`. */
type LoadOutcome = "ready" | "no-adapter";

async function loadFixtures(page: Page, zoom: number): Promise<LoadOutcome> {
  // No navigation and — deliberately — no `navigator.gpu.requestAdapter()`
  // from the page. An earlier revision probed for an adapter here to decide
  // whether to skip, and that probe is what broke every run: it opens a
  // second WebGPU consumer in the same renderer while the worker is still
  // bringing up its own device, and under SwiftShader one of the two loses.
  // The symptom was "GPU lost (destroyed)" on a fully-booted page, and it
  // appeared in exactly the run where the probe moved onto the page under
  // test. A test must not contend for the resource it is measuring.
  //
  // Adapter availability now comes from the app, which already reports it:
  // no adapter means an engine error saying so, and that is a skip.
  watchForErrors(page);
  // Zoom is set by the entry point, not by a gesture. ctrl+wheel does not
  // work here: Chrome treats it as browser zoom unless the page listener is
  // non-passive, so the app's zoom never moved and every capture after the
  // first failed. A golden needs an exact zoom anyway — a gesture that
  // lands "close enough" would rebase the baseline on every run.
  await page.goto(`/?pathFixtures&zoom=${String(zoom)}`);
  await waitForShell(page);

  const expected = `zoom ${String(Math.round(zoom * 100))}%`;
  const deadline = Date.now() + 20_000;
  let text = "";
  while (Date.now() < deadline) {
    text = await shellText(page);
    if (text.includes(expected)) return "ready";
    if (/no webgpu adapter|webgpu (is )?not supported/iu.test(text)) return "no-adapter";
    await page.waitForTimeout(250);
  }

  const errors = pageErrors.get(page) ?? [];
  throw new Error(
    [
      `Fixture corpus did not load — never saw "${expected}".`,
      `Shell text: ${text}`,
      `Page errors: ${errors.length > 0 ? errors.join(" | ") : "(none)"}`,
    ].join("\n")
  );
}

test.describe("path rendering goldens", () => {
  for (const level of ZOOM_LEVELS) {
    test(`corpus at ${level.name} (tolerance bucket ${String(level.bucket)})`, async ({ page }) => {
      const outcome = await loadFixtures(page, level.zoom);
      // Loud, annotated skip — never a silent pass (ADR-032): a runner
      // without an adapter must be visible in the report, with the
      // reference-machine procedure carrying the duty instead.
      test.skip(outcome === "no-adapter", "No WebGPU adapter on this runner.");
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
    const outcome = await loadFixtures(page, FIXTURE_ZOOM);
    test.skip(outcome === "no-adapter", "No WebGPU adapter on this runner.");
    const canvas = page.getByRole("region", { name: "Graphite canvas" });
    const atFit = await canvas.screenshot();

    // Reload at a different bucket rather than zooming in place: same
    // deterministic path, and it still proves re-tessellation happened,
    // because a blank or frozen canvas would produce identical bytes.
    await loadFixtures(page, 3);
    const atThreeX = await canvas.screenshot();

    expect(atFit.byteLength).toBeGreaterThan(0);
    expect(atThreeX.byteLength).toBeGreaterThan(0);
    expect(Buffer.compare(atFit, atThreeX)).not.toBe(0);
  });
});
