# Phase 8 M1 — MSAA frame-cost capture

ADR-031 required the cost of 4× MSAA to be measured rather than assumed;
ADR-032 Decision 2 made the capture an M1 exit criterion. Captured on the
reference machine 2026-07-25, before the mesh pipeline landed, so MSAA was
the only changed variable.

**Result: 4× MSAA costs under ~0.6 ms per frame at 1255 × 838 device
pixels — below this method's noise floor, and consistent with the ~0.42 ms
of resolve bandwidth the configuration implies. No material regression;
the exit criterion is met.**

## Setup

|             |                                                            |
| ----------- | ---------------------------------------------------------- |
| Machine     | i3-1115G4, 2C/4T, 8 GB (reference)                         |
| Viewport    | 1255 × 838 device px (CSS 1004 × 670, dpr 1.25)            |
| MSAA target | 16.05 MiB (`w × h × 4 samples × 4 B`)                      |
| Build       | `pnpm --filter @graphite/web dev`, both sides, one session |
| Baseline    | the commit before the frame-graph commit                   |

Dev mode, not a production preview: the stress commands are DEV-gated
(ADR-027) and do not exist in a production bundle. Dev changes only the
JavaScript — the WASM is the same release binary and the GPU work is
identical — so the _delta_ is valid, while the absolute figures are **not
comparable to the ADR-025 production baselines**.

## Results

| Scene             | Build    | Median FPS | Frame ms | Samples |
| ----------------- | -------- | ---------- | -------- | ------- |
| Demo grid, zoomed | baseline | 56         | 17.86    | 215     |
| Demo grid, zoomed | 4× MSAA  | 58         | 17.24    | 233     |
| Stress 10k        | baseline | 55         | 18.18    | 154     |
| Stress 10k        | 4× MSAA  | 54         | 18.52    | 213     |

| Quantity                                                | Value    |
| ------------------------------------------------------- | -------- |
| Noise floor (from the impossible reading below)         | ±0.62 ms |
| Measured 10k delta                                      | +0.34 ms |
| Theoretical resolve traffic (20.1 MiB/frame @ ~50 GB/s) | ~0.42 ms |

## Reading the result

The demo-grid row shows MSAA **faster** than baseline. That is physically
impossible — 4× multisampling cannot make a frame cheaper — so it is not a
result; it is a calibration. It establishes that this method cannot
resolve differences below ~0.6 ms, because neither scene is GPU-bound: at
this viewport the SDF shader is too cheap for a handful of shapes to
saturate the GPU, and the frame is spent elsewhere (worker culling,
render-list upload, and in dev the per-frame React HUD update).

The 10k delta of +0.34 ms sits below that floor, and independently agrees
with the ~0.42 ms of resolve bandwidth the target implies. Three
quantities in the same sub-millisecond band is enough to bound the cost
even though the probe failed to isolate it: **MSAA is affordable here**,
which is the question the exit criterion asks.

What this capture does **not** establish: an isolated MSAA cost figure. A
genuinely fragment-bound probe would need overdraw far beyond what the
current shape set can produce at this resolution. Worth revisiting when
M4's text rendering makes fragment cost material, and worth re-measuring
at a higher-dpr display, where the target grows with the square of the
scale factor.

## Method (for repetition)

1. **Viewport** — devtools console, main thread; do not read `canvas.width`
   (control is transferred to the OffscreenCanvas, so the placeholder's
   attributes are stale):
   ```js
   const c = document.querySelector("canvas");
   const r = c.getBoundingClientRect(),
     d = window.devicePixelRatio;
   console.log(`${Math.round(r.width * d)} × ${Math.round(r.height * d)} device px, dpr ${d}`);
   ```
2. **Sampler** — the HUD renders medians for milliseconds at a time, so
   scrape it at 20 Hz. Works unchanged on both builds, which matters
   because the baseline is a previous commit and cannot carry
   instrumentation:
   ```js
   window.__cap = (label, secs = 12) => {
     const fps = [],
       ms = [];
     const t = setInterval(() => {
       const spans = [...document.querySelectorAll("footer span, [class*=status] span")];
       const f = spans.find((s) => /^\d+ fps$/.test(s.textContent.trim()));
       const m = spans.find((s) => /^[\d.]+ ms$/.test(s.textContent.trim()));
       if (f && m) {
         fps.push(parseFloat(f.textContent));
         ms.push(parseFloat(m.textContent));
       }
     }, 50);
     setTimeout(() => {
       clearInterval(t);
       const med = (a) => {
         const b = [...a].sort((x, y) => x - y);
         return b.length ? b[b.length >> 1] : NaN;
       };
       console.log(`${label}: median ${med(fps)} fps | n=${fps.length}`);
     }, secs * 1000);
   };
   ```
3. `pnpm --filter @graphite/web dev` on the baseline commit. New Document,
   zoom until shapes fill the viewport, record the HUD's zoom %, then
   `__cap(...)` while panning continuously. Repeat with palette → **Load
   Stress Scene (10k)**.
4. Switch to the MSAA commit, `pnpm turbo run build`, dev server, repeat
   both scenes at the **same window size and zoom %**.

**Do not use the HUD's `ms` column as the MSAA metric.** It is
`renderTimeMs` — wall-clock around `createCommandEncoder` → `queue.submit()`
— and `submit()` returns once commands are queued, never waiting for the
GPU. It read 0.10–0.20 ms across every scene here, including a tenfold
object increase, because the render loop issues one instanced draw
regardless of object count. It measures CPU encode work, which MSAA does
not touch. FPS is the only metric in this HUD that can see GPU cost.

Sample counts below `seconds × 20` mean panning stopped: idle frames blank
the HUD (ADR-025 by design), and the gap biases the median.

## Open question — palette interaction under a live engine

Surfaced by the visual-golden suite, 2026-07-29, and **left unresolved**.
With a live engine in CI, driving the command palette failed twice in
different ways: a click reported _"element was detached from the DOM,
retrying"_, and a subsequent `Enter` did not activate the focused,
enabled option at all. Neither reproduces in the shell suite, which runs
without a WebGPU adapter and therefore never renders a frame.

An earlier revision of this section blamed per-frame re-rendering of the
whole shell. **That was wrong and is retracted**: `StatusBar` is the only
subscriber to `EngineFrameContext`, so frame stats do not re-render the
palette, and `frame:idle` is edge-triggered behind an `idleNotified`
guard rather than fired per tick. The mechanism is not established, and
nothing should rest on it — including any attribution of the frame times
above to React work.

The golden suite no longer depends on the palette (it uses a DEV-only
`?pathFixtures` entry point), so this is not blocking. But "the palette
may be unreliable while the engine renders" is serious enough to deserve
a deliberate investigation with a reproduction, rather than an inference
from CI logs.

## Separate finding — 100k render-path throughput

A 100k baseline run was attempted and discarded (n=14, far too thin for a
median), but it recorded something worth keeping: **10 fps**, with scene
build 81.7 ms and rebuild 405.9 ms. Nothing to do with MSAA — the render
list alone is ~6.4 MB per frame at that object count, uploaded whole under
the current damage model. ADR-023 deferred the spatial index on measured
grounds and this is the first counter-evidence at 100k. It belongs to a
later milestone with its own capture and its own ADR, not to this one.
