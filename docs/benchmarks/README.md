# Benchmark Baselines

Per-phase performance baselines, recorded on the reference machine — the
environment the targets are defined against:

> **Reference machine:** Windows 11 · Intel Core i3-1115G4 (11th Gen, 2C/4T,
> 3.0 GHz base) · 8 GB DDR4-3200 · Intel UHD Graphics (Xe-LP, integrated,
> shared memory) · SSD — Surajit's workstation. Deliberately a **floor-spec
> baseline**: two cores and an integrated GPU. Targets that hold here hold
> on effectively all contributor and user hardware.
> CI containers and sandboxes vary too much to serve as baselines; numbers are
> only comparable machine-to-same-machine.

## Recording a baseline

At every milestone commit, run and save:

```powershell
# TypeScript benches (protocol + document)
pnpm --filter @graphite/protocol exec vitest bench --run > docs/benchmarks/<date>-protocol.txt
pnpm --filter @graphite/web exec vitest bench --run > docs/benchmarks/<date>-document.txt

# Rust benches (engine crate — Criterion, HTML report under target/criterion)
cargo bench -p graphite-engine
```

Commit the two text files plus a one-line summary row in the table below.
Criterion's `target/criterion` output stays local (gitignored); copy the
headline numbers into the summary.

## CI ceilings (Phase 7 M3, ADR-023)

Every push also runs the Criterion suite in quick mode on CI and gates the
means against `benchmarks/ceilings.json` via
`scripts/check-bench-ceilings.mjs`. Ceilings are absolute and deliberately
generous — shared runners are noisy, so the gate exists to catch
order-of-magnitude regressions the moment they land, while this file's
reference-machine history tracks real drift. Every ceiling records its
derivation basis inline; entries marked _analytical_ are recalibrated from
the first reference run after the benches ship. A bench without a ceiling
prints a CI warning (add one, with its basis); a ceiling without a bench
prints an info line (prune it).

## Through-worker rebuild cost (User Timing)

`rebuildSceneFromDocument` wraps itself in a `performance.measure`
(`"scene-rebuild"`), which lives in the **worker's** timeline. To capture
it on the reference machine: DevTools → Performance → record → File → Open
a document → stop; the measure appears under the engine worker's track in
the Timings lane. The Rust half of a 10k insert is 352 µs (table below);
this measure is the whole path — deserialise, validate, per-node WASM
calls, map registration. The 10k _workload_ arrives with M5's seeded
stress scene; until then the instrument stands ready and any real document
gives a lower-bound reading.

## Baselines

| Date       | Milestone         | insert_10k | render_list_10k                  | hit_test_10k                 | remove_node_1k | doc setNodePosition ×1k | Notes                                                                                                 |
| ---------- | ----------------- | ---------- | -------------------------------- | ---------------------------- | -------------- | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| 2026-07-14 | Phase 7 (post-M2) | 352.2 µs   | 331.6 µs visible / 7.9 µs culled | 0.80 µs @1k, 60 %-depth hit¹ | 5.97 µs        | pending²                | First reference run ever — full record + interpretation in [phase7-baseline.md](./phase7-baseline.md) |

¹ That run's Criterion bench measured a 60 %-depth _hit_ at 1k, not a
worst-case scan at 10k — see the baseline doc's footnote. **Phase 7 M3
landed the fix**: `hit_test_miss/{1k,10k,100k}` (full-scan worst case) and
`hit_test_top_10k` (first-probe best case) replace `hit_test_1000`; from
the next recorded row this column reports the true 10k worst case
(`hit_test_miss/10000`).
² TypeScript benches (`vitest bench` in protocol + web) still need one
reference-machine run — commands above.
