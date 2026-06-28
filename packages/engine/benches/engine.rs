//! Phase 3 benchmarks — scene graph with mixed shape types.

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};
use graphite_engine::{version, SceneGraph};

// ─── Baseline ────────────────────────────────────────────────────────────────

fn bench_version(c: &mut Criterion) {
    c.bench_function("engine::version", |b| b.iter(|| black_box(version())));
}

// ─── Scene construction ───────────────────────────────────────────────────────

fn bench_insert_shapes(c: &mut Criterion) {
    let counts = [100u32, 1_000, 10_000];
    let mut group = c.benchmark_group("scene_graph::insert_shapes");

    for &count in &counts {
        group.bench_with_input(BenchmarkId::from_parameter(count), &count, |b, &n| {
            b.iter(|| {
                let mut g = SceneGraph::new();
                let frame = g.add_frame(0.0, 0.0, 100_000.0, 100_000.0);
                let cols = 100u32;
                for i in 0..n {
                    let x = (i % cols) as f32 * 110.0;
                    let y = (i / cols) as f32 * 110.0;
                    match i % 3 {
                        0 => {
                            black_box(g.add_rect(frame, x, y, 100.0, 100.0, 99, 179, 237, 255));
                        }
                        1 => {
                            let id = g.add_rect(frame, x, y, 100.0, 100.0, 246, 173, 85, 255);
                            g.set_corner_radius(black_box(id), 15.0);
                        }
                        _ => {
                            black_box(g.add_ellipse(frame, x, y, 100.0, 100.0, 104, 211, 145, 255));
                        }
                    }
                }
                black_box(g.node_count())
            });
        });
    }
    group.finish();
}

fn bench_set_stroke(c: &mut Criterion) {
    c.bench_function("scene_graph::set_stroke_100", |b| {
        b.iter(|| {
            let mut g = SceneGraph::new();
            let frame = g.add_frame(0.0, 0.0, 10_000.0, 10_000.0);
            for i in 0..100u32 {
                let id = g.add_rect(frame, (i * 10) as f32, 0.0, 8.0, 8.0, 99, 179, 237, 255);
                g.set_stroke(black_box(id), 255, 128, 0, 255, 2.0);
            }
            black_box(g.node_count())
        });
    });
}

// ─── Render list / culling ────────────────────────────────────────────────────

fn build_mixed_grid(n: u32) -> SceneGraph {
    let mut g = SceneGraph::new();
    let frame = g.add_frame(0.0, 0.0, 100_000.0, 100_000.0);
    let cols = 100u32;
    for i in 0..n {
        let x = (i % cols) as f32 * 110.0;
        let y = (i / cols) as f32 * 110.0;
        match i % 3 {
            0 => {
                g.add_rect(frame, x, y, 100.0, 100.0, 99, 179, 237, 255);
            }
            1 => {
                let id = g.add_rect(frame, x, y, 100.0, 100.0, 246, 173, 85, 255);
                g.set_corner_radius(id, 12.0);
            }
            _ => {
                g.add_ellipse(frame, x, y, 100.0, 100.0, 104, 211, 145, 255);
            }
        }
    }
    g
}

fn bench_render_list_all_visible(c: &mut Criterion) {
    let counts = [100u32, 1_000, 10_000];
    let mut group = c.benchmark_group("scene_graph::render_list_all_visible");
    for &count in &counts {
        let g = build_mixed_grid(count);
        group.bench_with_input(BenchmarkId::from_parameter(count), &count, |b, _| {
            b.iter(|| black_box(g.get_render_list(5_500.0, 5_500.0, 0.05, 1920.0, 1080.0)));
        });
    }
    group.finish();
}

fn bench_render_list_mostly_culled(c: &mut Criterion) {
    let counts = [100u32, 1_000, 10_000];
    let mut group = c.benchmark_group("scene_graph::render_list_mostly_culled");
    for &count in &counts {
        let g = build_mixed_grid(count);
        group.bench_with_input(BenchmarkId::from_parameter(count), &count, |b, _| {
            // Tiny viewport — only a handful of shapes visible
            b.iter(|| black_box(g.get_render_list(0.0, 0.0, 1.0, 800.0, 600.0)));
        });
    }
    group.finish();
}

criterion_group!(
    benches,
    bench_version,
    bench_insert_shapes,
    bench_set_stroke,
    bench_render_list_all_visible,
    bench_render_list_mostly_culled,
);
criterion_main!(benches);
