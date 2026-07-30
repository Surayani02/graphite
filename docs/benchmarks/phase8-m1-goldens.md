# Phase 8 M1 — visual goldens (Net 2): status and procedure

Net 1 (exact Rust mesh snapshots, `packages/geometry`) runs everywhere and
gates on every push. **Net 2 — pixel goldens of the rendered corpus — is
verified on a reference machine, not in CI.** This records why, and how to
discharge the duty.

## Why CI cannot run it

GitHub's runners **render correctly but cannot capture the result**. In a
failing run the engine initialises, the fixture corpus builds, the status
bar reports the framing zoom, and no GPU error is raised — yet every
screenshot comes back uniform: two captures at different tolerance buckets
are byte-identical, and 100 % of pixels differ from a baseline taken under
the _same flags_ on a machine that has a display. Frames reach the GPU and
not the compositor.

Tried, in order, each with a full CI run:

| Attempt                                                  | Result                                                                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| SwiftShader flags alone                                  | `GPU lost (destroyed)` — device created and destroyed                                                                 |
| `+ mesa-vulkan-drivers`, `libvulkan1`                    | **Fixed the device loss.** Chrome's SwiftShader WebGPU path runs on Dawn's Vulkan backend, and runners ship no loader |
| `+ --enable-unsafe-swiftshader`, `--disable-gpu-sandbox` | No change — byte-identical failure, same pixel counts                                                                 |

The Vulkan step is kept: it is a genuine fix for a genuine gap, and it is
what moved the failure from "no device" to "no capture".

## How the suite behaves now

`e2e-golden/path-rendering.spec.ts` probes the capability once per worker:
it captures the corpus at two tolerance buckets and compares. Identical
pixels mean the environment cannot produce a meaningful comparison, so the
screenshot tests **skip with an annotation** rather than fail.

This is deliberately a capability probe and not a CI opt-out. If a runner
image ever gains WebGPU capture, the probe passes and the gate resumes with
no code change and no one having to remember it existed.

## Reference-machine procedure

Run before merging any change to tessellation, the mesh cache, the draw
plan, the frame graph, or the fixture corpus.

```bash
pnpm --filter @graphite/web run test:golden
```

A machine with a display is required; hardware WebGPU is not. The
2026-07-30 reference run was a Dell Inspiron 15-3567 (i3-6006U, Intel HD
520, Ubuntu 26.04) which reports **no WebGPU adapter at all** — Chromium
falls back to SwiftShader, and that is what produced the committed
`-linux` baselines.

First run writes baselines and exits non-zero; that is expected. **Look at
the images** before trusting them — `--update-snapshots` blesses whatever
it renders, including a regression:

- even-odd star hollow at its centre, non-zero star solid
- both donuts hollow
- figure-eight lobes filled
- round caps and joins on the open polyline
- miter spikes clamped, not unbounded
- curves smooth at the 3× capture, not faceted
- the alternating rect/triangle strip along the bottom — the draw plan's
  interleaving worst case

Baselines are platform-suffixed but **not adapter-suffixed**: a baseline
captured on a different adapter carries a filename CI would accept and
pixels it could never match. Local `-win32`/`-darwin` snapshots are
gitignored for this reason; only SwiftShader-rendered `-linux` files are
committed.

## What this costs, honestly

A rendering regression can reach `main` and be caught at the next reference
run rather than at the pull request. Mitigating that:

- **Net 1 gates on every push** and catches any change in tessellated
  geometry exactly — which is the largest share of what M1 can break.
- The engine's own contract tests (draw-plan ordering, cache invalidation,
  fill-rule truth table by measured mesh area) run in CI.
- What is genuinely unguarded in CI is the _pixel_ path: pipeline state,
  uniform layout, MSAA resolve. Changes there require a reference run, and
  this document is the reminder.
