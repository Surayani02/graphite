//! Phase 0 benchmark scaffold for the Graphite engine.
//!
//! Criterion is configured from the start so that:
//! 1. The harness compiles on every CI run (`cargo bench --no-run`).
//! 2. Historical performance data collection begins from the first real
//!    implementation in Phase 1.
//!
//! The placeholder benchmark is intentionally trivial — it measures
//! `version()` to keep the harness exercised without adding noise.

use criterion::{black_box, criterion_group, criterion_main, Criterion};
use graphite_engine::version;

fn bench_version(c: &mut Criterion) {
    // `black_box` prevents the compiler from optimising the call away.
    c.bench_function("engine::version", |b| b.iter(|| black_box(version())));
}

criterion_group!(benches, bench_version);
criterion_main!(benches);
