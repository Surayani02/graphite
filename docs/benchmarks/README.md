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

## Baselines

| Date       | Milestone         | insert_10k | render_list_10k                  | hit_test_10k                 | remove_node_1k | doc setNodePosition ×1k | Notes                                                                                                 |
| ---------- | ----------------- | ---------- | -------------------------------- | ---------------------------- | -------------- | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| 2026-07-14 | Phase 7 (post-M2) | 352.2 µs   | 331.6 µs visible / 7.9 µs culled | 0.80 µs @1k, 60 %-depth hit¹ | 5.97 µs        | pending²                | First reference run ever — full record + interpretation in [phase7-baseline.md](./phase7-baseline.md) |

¹ The current Criterion bench measures a 60 %-depth _hit_ at 1k, not a
worst-case scan at 10k — see the baseline doc's footnote. M3 extends the
bench with miss-case and 10k/100k variants; this column switches to the
true 10k worst case then.
² TypeScript benches (`vitest bench` in protocol + web) still need one
reference-machine run — commands above.
