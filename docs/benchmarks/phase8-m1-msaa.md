# Phase 8 M1 — MSAA frame-cost capture

ADR-031 requires the cost of 4× MSAA to be **measured against the ADR-025
damage-model baselines**, not assumed, before M1 can exit. ADR-032
Decision 2 makes that capture an explicit exit criterion.

This capture is deliberately taken **before the mesh pipeline lands**, so
the number isolates one variable: the same scenes, the same SDF draws, the
only change being that the frame now renders into a shared multisampled
target and resolves to the swap chain. Once meshes are drawing, an MSAA
regression and a tessellation regression would be indistinguishable in the
totals.

## Procedure (reference machine — i3-1115G4, 2C/4T, 8 GB)

1. Build and serve a production bundle: `pnpm turbo run build`, then
   `pnpm --filter @graphite/web exec vite preview`.
2. Open the editor, let the shell settle, and keep the window at its
   normal size — record the viewport in device pixels (the HUD reports
   it, and target memory is `w × h × 16` bytes).
3. Load the 10k stress scene: command palette → **Debug: stress 10k**
   (ADR-027).
4. Let the scene settle, then pan continuously for ~10 s so every frame
   is dirty and the damage model cannot skip work.
5. Record from the HUD: median FPS, median frame time, and the reported
   GPU-submit time.
6. Repeat at **stress 100k**.
7. Repeat both with the previous build (`git stash` this commit, or check
   out the commit before it) to get the non-MSAA baseline on the same
   machine in the same session — a same-session comparison removes
   thermal and background-load drift, which at this hardware tier is
   larger than the effect being measured.

## Results

| Scene | Build    | Median FPS | Median frame ms | GPU submit ms | Viewport (device px) | Target memory |
| ----- | -------- | ---------- | --------------- | ------------- | -------------------- | ------------- |
| 10k   | pre-MSAA |            |                 |               |                      | —             |
| 10k   | 4× MSAA  |            |                 |               |                      |               |
| 100k  | pre-MSAA |            |                 |               |                      | —             |
| 100k  | 4× MSAA  |            |                 |               |                      |               |

_Fill from the reference machine; leave the pre-MSAA row exactly as
measured even if it is worse than a previously recorded figure — the
comparison is only valid within one session._

## Reading the result

- **≥ 58 FPS at 10k with MSAA on** is the bar (BLUEPRINT's canvas-render
  target, HUD tolerance). Meeting it is the exit criterion.
- A modest cost at 10k and a larger one at 100k is the expected shape:
  MSAA cost scales with **pixels**, not objects, so the delta should be
  roughly constant in milliseconds while the 100k frame is longer
  overall — a delta that instead grows with object count is a finding
  worth investigating, not noise.
- If the 10k bar is missed, ADR-032 Decision 2 is reopened, not patched:
  the recorded alternatives are dropping to a non-multisampled target with
  analytic AA for SDF and a fallback for mesh edges, or accepting a
  quality/perf switch as a setting. Either is an ADR, with this capture as
  its evidence.
