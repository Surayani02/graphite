# Benchmark Baselines

Per-phase performance baselines, recorded on the reference machine (Surajit's
Windows 11 workstation — the environment the targets are defined against).
CI containers and sandboxes vary too much to serve as baselines; numbers are
only comparable machine-to-same-machine.

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

| Date | Milestone | insert_10k | render_list_10k | hit_test_10k | doc setNodePosition ×1k | Notes |
| ---- | --------- | ---------- | --------------- | ------------ | ----------------------- | ----- |

_First row lands with the M2 commit._
