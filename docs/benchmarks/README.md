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

| Date | Milestone | insert_10k | render_list_10k | hit_test_10k | remove_node_1k | doc setNodePosition ×1k | Notes |
| ---- | --------- | ---------- | --------------- | ------------ | -------------- | ----------------------- | ----- |

_No row committed yet — `cargo bench` requires a real Rust toolchain
(1.96 stable), which no sandboxed session in this project's history has
had access to. Every milestone through M3 has queued this as the same
outstanding action: run the commands above on the reference machine and
commit the first row. `bench_remove_node` (M3) is included in the column
set above so it's captured whenever that run happens, rather than needing
a second baseline pass later._
