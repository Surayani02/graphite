//! Geometry benchmarks — Phase 8 M1 (ADR-031/032).
//!
//! The recorded target this file exists to police: 1k-segment
//! tessellation < 4 ms on the reference machine (design doc §3), i.e.
//! `fill_blob/1024`. Ceilings land in `benchmarks/ceilings.json` from the
//! reference-machine capture per ADR-023 — until then CI's quick run
//! surfaces the new benches as warnings, by the ceilings gate's design.
//!
//! `black_box` from `std::hint`, matching `packages/engine/benches` (the
//! criterion re-export is version-unstable).

use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use graphite_geometry::corpus::{blob, default_stroke, star};
use graphite_geometry::{tessellate_fill, tessellate_stroke, FillRule};
use std::hint::black_box;

const TOLERANCE: f32 = 0.25; // bucket-0 world tolerance (ADR-032 §4)

fn bench_fill_blob(c: &mut Criterion) {
    let mut group = c.benchmark_group("geometry::fill_blob");
    for segments in [64u32, 256, 1024] {
        let geometry = blob(segments);
        group.bench_with_input(BenchmarkId::from_parameter(segments), &geometry, |b, g| {
            b.iter(|| black_box(tessellate_fill(black_box(g), TOLERANCE).unwrap()));
        });
    }
    group.finish();
}

fn bench_stroke_blob(c: &mut Criterion) {
    let style = default_stroke();
    let mut group = c.benchmark_group("geometry::stroke_blob");
    for segments in [64u32, 256, 1024] {
        let geometry = blob(segments);
        group.bench_with_input(BenchmarkId::from_parameter(segments), &geometry, |b, g| {
            b.iter(|| black_box(tessellate_stroke(black_box(g), &style, TOLERANCE).unwrap()));
        });
    }
    group.finish();
}

fn bench_fill_star_evenodd(c: &mut Criterion) {
    let geometry = star(FillRule::EvenOdd);
    c.bench_function("geometry::fill_star_evenodd", |b| {
        b.iter(|| black_box(tessellate_fill(black_box(&geometry), TOLERANCE).unwrap()));
    });
}

fn bench_fill_long_cubic_tolerance(c: &mut Criterion) {
    use graphite_geometry::corpus::long_cubic;
    let geometry = long_cubic();
    let mut group = c.benchmark_group("geometry::fill_long_cubic");
    for tolerance in [1.0f32, 0.25, 0.015_625] {
        group.bench_with_input(
            BenchmarkId::from_parameter(tolerance),
            &tolerance,
            |b, &tol| {
                b.iter(|| black_box(tessellate_fill(black_box(&geometry), tol).unwrap()));
            },
        );
    }
    group.finish();
}

criterion_group!(
    benches,
    bench_fill_blob,
    bench_stroke_blob,
    bench_fill_star_evenodd,
    bench_fill_long_cubic_tolerance
);
criterion_main!(benches);
