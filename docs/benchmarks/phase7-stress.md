# Phase 7 — M5 Stress Baseline (10k / 100k)

**Status: procedure delivered — reference-machine capture pending.** The
generator, the Debug commands, and this procedure shipped with M5; the
results tables below are filled from the reference machine (see
[README](./README.md) for the machine spec), then this file becomes the
Phase-7 exit record. Container and CI numbers are never entered here.

The scene under test is the deterministic stress grid (ADR-027): one
100 000 × 100 000 root frame plus `count − 1` shapes on a 100-column,
110-unit-pitch grid, kind and colour cycling every three shapes — the
same geometry as `build_mixed_grid` in the Criterion suite, so the Rust
micro-bench numbers and these through-worker numbers describe one
workload. `count` is total document nodes; 100k is the exact
`DOCUMENT_LIMITS.maxNodes` ceiling, deliberately.

## Preconditions

- Dev server: `pnpm --filter @graphite/web dev` (the Debug commands exist
  only in dev builds).
- Chromium-based browser with WebGPU enabled; close other tabs — the
  reference machine has 2 cores and shares its GPU memory.
- DevTools open on the app tab: Console (for the `[stress]` line) and
  Performance panel (worker-track User Timing measures `stress-build` and
  `scene-rebuild`).

## Production invisibility (verify once per release build)

The surface must be compiled out, not hidden (ADR-027). Against
`pnpm --filter @graphite/web build` output:

```powershell
# Both must print no matches:
Select-String -Path apps/web/dist/assets/*.js -Pattern "debug.stress"
Select-String -Path apps/web/dist/assets/*.js -Pattern "stress-frame"
```

The container build verified both greps empty at delivery; re-verify on
the reference build and tick here: ☐

## Capture procedure

Run the full set at **10k first**, record, then repeat at **100k**.

1. **Load (through-worker build).** Palette (`mod+k`) → "Load Stress
   Scene (10k)". The worker logs one line:
   `[stress] 10000 nodes — build <a> ms, scene rebuild <b> ms`. Record
   both; their sum is the through-worker load cost. Run three times
   (re-invoke the command), record the median.
2. **Reload load path.** With the 10k scene loaded, reload the tab — the
   scene restores through the real `document:load` path from
   localStorage. Record a Performance profile across the reload and read
   the `scene-rebuild` measure on the worker track. (100k skips this
   step: its snapshot exceeds the localStorage quota and the existing
   guard drops it — expect one `failed to persist` console error at
   load, which is the guard working, not a defect.)
3. **Steady-state render.** HUD FPS while continuously panning for
   ~10 s (pan tool, or middle-mouse drag), in two framings: (a) **default
   camera** — a handful of shapes visible, the mostly-culled case; (b)
   **minimum zoom** — wheel out until the HUD reads **10 %** (`MIN_ZOOM`).
   At 10k that fits the grid's full ~11,000-unit width on any
   ≥ 1,100-px-wide viewport, with roughly 7k of the 10k shapes inside an
   ~800-px-tall frustum. At 100k the full grid is unreachable **by
   design** — its ~110,000-unit height needs ~0.7 % zoom against a 10 %
   floor — so the frustum again holds ≈ 7k shapes: the 100k framing
   measures _culling over 100k nodes with a ~7k upload_, not drawing
   100k at once (the all-visible twin lives in Criterion as
   `render_list` at scale). The damage model parks the loop when idle
   (ADR-025), so read the HUD **while interacting**; an idle "—" is
   correct behaviour, not a stall.
4. **Selection response.** Record a Performance profile while clicking
   individual shapes ~10 times; for each click, measure `pointer:down`
   arrival on the worker track to the following frame submit. Record the
   median and worst.
5. **Hit-test.** In the same profile, click empty canvas far outside the
   grid (worst case: full reverse scan, nothing hit) and read the
   `pointer:down` handler duration. The Criterion twins
   (`hit_test_miss/10k`, `/100k`) are already CI-gated; enter their
   latest reference-run means alongside for the composed picture.
6. **Export at scale.** File → Export: SVG, then PNG at 1×. Record wall
   time to the save dialog and success/failure. Two outcomes are
   **pre-registered from code reading**, so record against them rather
   than being surprised: (a) `contentBounds` includes _every_ node —
   frames too — so the stress scene's 100,000-unit Criterion-parity root
   frame drives the fit bounds to ~102,000 world units: **SVG should
   succeed** (a valid multi-MB file) but depict the grid as a small
   cluster in a mostly-empty artboard. (b) **Raster is expected to
   fail**: ~104,000 px at 1× exceeds WebGPU's default
   `maxTextureDimension2D` (8,192 — the device is requested with no
   `requiredLimits`) and the readback buffer would dwarf
   `maxBufferSize`; the failure should surface as a clean export error
   through the existing `export:error` path (the promise settles — the
   dialog must not hang). Record the exact error text. Both are M5
   _findings_, not capture blockers — the closeout decides between a
   raster device-limit clamp, frame-exclusion in `contentBounds`, or
   both (ADR-026 follow-up).
7. **UI honesty checks (record observations, not verdicts).** With 100k
   loaded: Layers panel scroll behaviour (it renders real rows — not
   virtualized, a known edge), palette responsiveness while typing a
   node-name query (node search scores every non-frame node per
   keystroke), and main-thread jank when the `document:nodes` broadcast
   lands. Also confirm the M5-FR1 regression check: with the **Layers tab
   active** at both scales, the canvas keeps rendering and the console
   shows no Dawn texture-size errors — the shell's containment fix holds
   and the panel scrolls inside its own chain.

## Results — 10k (MVP budget)

| Metric                                | Target (BLUEPRINT) | Measured  | Verdict   |
| ------------------------------------- | ------------------ | --------- | --------- |
| Through-worker load (build + rebuild) | < 1 s              | _pending_ | _pending_ |
| Reload via `document:load`            | < 1 s              | _pending_ | _pending_ |
| Steady render, mostly-culled          | ≥ 58 fps HUD       | _pending_ | _pending_ |
| Steady render, min-zoom (10 %)        | ≥ 58 fps HUD       | _pending_ | _pending_ |
| Selection response (median / worst)   | < 16 ms            | _pending_ | _pending_ |
| Hit-test miss, in-app                 | < 1 ms             | _pending_ | _pending_ |
| Hit-test miss, Criterion reference    | < 1 ms             | _pending_ | _pending_ |
| Export SVG / PNG 1× (wall, step 6)    | pre-registered     | _pending_ | —         |

## Results — 100k (system ceiling probe)

| Metric                            | Reference       | Measured  | Notes |
| --------------------------------- | --------------- | --------- | ----- |
| Through-worker load               | record          | _pending_ |       |
| Steady render, mostly-culled      | record          | _pending_ |       |
| Steady render, min-zoom (10 %)    | record          | _pending_ |       |
| Selection response                | record          | _pending_ |       |
| Hit-test miss, in-app             | informs ADR-023 | _pending_ |       |
| Layers / palette / broadcast jank | observations    | _pending_ |       |

The 100k table carries no pass/fail column: 100k is beyond the MVP
charter. Its purpose is the ADR-023 R-tree re-adoption decision and an
honest record of where the current architecture's edges are.

## Phase-7 exit assessment

_Written after both tables are filled: does the MVP meet its own
performance charter at 10k, and where are the documented edges?
BLUEPRINT line 75's final item and the Phase 7 row flip on that
assessment, not before._
