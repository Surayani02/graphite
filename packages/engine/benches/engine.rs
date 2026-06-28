//! Phase 2 benchmarks — scene graph operations.
//!
//! Run with:  cargo bench
//! Results:   target/criterion/

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};
use graphite_engine::{version, SceneGraph};

// ─── Baseline ────────────────────────────────────────────────────────────────

fn bench_version(c: &mut Criterion) {
    c.bench_function("engine::version", |b| b.iter(|| black_box(version())));
}

// ─── Scene graph construction ─────────────────────────────────────────────────

fn bench_insert_rects(c: &mut Criterion) {
    let counts = [100u32, 1_000, 10_000];
    let mut group = c.benchmark_group("scene_graph::insert_rects");

    for &count in &counts {
        group.bench_with_input(BenchmarkId::from_parameter(count), &count, |b, &n| {
            b.iter(|| {
                let mut g     = SceneGraph::new();
                let frame     = g.add_frame(0.0, 0.0, 100_000.0, 100_000.0);
                let cols: u32 = 100;
                for i in 0..n {
                    let x = (i % cols) as f32 * 110.0;
                    let y = (i / cols) as f32 * 110.0;
                    black_box(g.add_rect(frame, x, y, 100.0, 100.0, 99, 179, 237, 255));
                }
                black_box(g.node_count())
            });
        });
    }

    group.finish();
}

// ─── Render list / culling ────────────────────────────────────────────────────

fn build_grid(n: u32) -> SceneGraph {
    let mut g     = SceneGraph::new();
    let frame     = g.add_frame(0.0, 0.0, 100_000.0, 100_000.0);
    let cols: u32 = 100;
    for i in 0..n {
        let x = (i % cols) as f32 * 110.0;
        let y = (i / cols) as f32 * 110.0;
        g.add_rect(frame, x, y, 100.0, 100.0, 99, 179, 237, 255);
    }
    g
}

fn bench_render_list_all_visible(c: &mut Criterion) {
    let counts = [100u32, 1_000, 10_000];
    let mut group = c.benchmark_group("scene_graph::render_list_all_visible");

    for &count in &counts {
        let g = build_grid(count);
        group.bench_with_input(BenchmarkId::from_parameter(count), &count, |b, _| {
            // Camera centred on the grid, zoom low enough to see everything
            b.iter(|| black_box(g.get_render_list(5_500.0, 5_500.0, 0.05, 1920.0, 1080.0)));
        });
    }

    group.finish();
}

fn bench_render_list_mostly_culled(c: &mut Criterion) {
    let counts = [100u32, 1_000, 10_000];
    let mut group = c.benchmark_group("scene_graph::render_list_mostly_culled");

    for &count in &counts {
        let g = build_grid(count);
        group.bench_with_input(BenchmarkId::from_parameter(count), &count, |b, _| {
            // Tiny viewport — only a handful of rects visible
            b.iter(|| black_box(g.get_render_list(0.0, 0.0, 1.0, 800.0, 600.0)));
        });
    }

    group.finish();
}

criterion_group!(
    benches,
    bench_version,
    bench_insert_rects,
    bench_render_list_all_visible,
    bench_render_list_mostly_culled,
);
criterion_main!(benches);