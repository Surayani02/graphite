//! Scene-graph benchmarks — Phase 3 baseline, Phase 7 M3 semantics fix.
//!
//! `black_box` comes from `std::hint`, not `criterion`: the re-export is
//! deprecated-then-removed across criterion majors, and the std form keeps
//! this file source-compatible with both the pinned 0.5 line and the 0.8
//! upgrade (Dependabot PR #4), which should merge with zero edits here.
//!
//! Hit-test coverage (Phase 7 M3, ADR-023): the retired `hit_test_1000`
//! measured a 60 %-depth hit at one size — neither bound, one scale. Its
//! replacements measure the worst case (`hit_test_miss/*`: full reverse
//! scan, nothing hit) at 1k/10k/100k, and the best case
//! (`hit_test_top_10k`: the topmost shape wins on the first probe). The
//! docs/benchmarks README baseline-table footnote records the column
//! switch.

use criterion::{criterion_group, criterion_main, BatchSize, BenchmarkId, Criterion};
use graphite_engine::{version, SceneGraph};
use std::hint::black_box;

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

// ─── Hit testing (Phase 7 M3 matrix) ─────────────────────────────────────────

fn bench_hit_test_miss(c: &mut Criterion) {
    // Worst case: the point is outside every shape, so the reverse scan
    // visits all n nodes before returning None. This is the number the
    // <1 ms hit-test target is judged against — ADR-023's extrapolations
    // (~1.3 µs @ 1k, ~13–30 µs @ 10k, ~0.3–0.6 ms @ 100k on the reference
    // machine), now measured instead of derived.
    let counts = [1_000u32, 10_000, 100_000];
    let mut group = c.benchmark_group("scene_graph::hit_test_miss");
    for &count in &counts {
        let g = build_mixed_grid(count);
        group.bench_with_input(BenchmarkId::from_parameter(count), &count, |b, _| {
            b.iter(|| black_box(g.hit_test(-500.0, -500.0)));
        });
    }
    group.finish();
}

fn bench_hit_test_top(c: &mut Criterion) {
    // Best case: the point lands inside the topmost (last-added) shape, so
    // the reverse scan succeeds on its first renderable probe. In the 10k
    // grid (100 cols × 110 px cells) shape 9 999 spans
    // (10 890, 10 890)–(10 990, 10 990).
    let g = build_mixed_grid(10_000);
    c.bench_function("scene_graph::hit_test_top_10k", |b| {
        b.iter(|| black_box(g.hit_test(10_900.0, 10_900.0)));
    });
}

// ─── Phase 6 Milestone 3 ────────────────────────────────────────────────────

fn bench_remove_node(c: &mut Criterion) {
    // Excludes graph construction from the timed portion — remove_node's own
    // cost (tombstone + order splice + unlink_child) is what this measures,
    // not add_rect.
    c.bench_function("scene_graph::remove_node_1000", |b| {
        b.iter_batched(
            || build_mixed_grid(1_000),
            |mut g| black_box(g.remove_node(500)),
            BatchSize::SmallInput,
        );
    });
}

// ─── Phase 7 Milestone 3 ────────────────────────────────────────────────────

fn bench_move_node_to_index(c: &mut Criterion) {
    // Worst-case splice at MVP scale: the topmost id (10 000 — the frame is
    // id 0, shapes 1..=10 000) moves to the back of the paint order,
    // forcing a full-vec memmove. iter_batched rebuilds the graph per batch
    // because the move mutates it; setup time is excluded from the
    // measurement.
    c.bench_function("scene_graph::move_node_to_index_10k", |b| {
        b.iter_batched(
            || build_mixed_grid(10_000),
            |mut g| {
                g.move_node_to_index(10_000, 0);
                black_box(g.node_count())
            },
            BatchSize::SmallInput,
        );
    });
}

criterion_group!(
    benches,
    bench_version,
    bench_insert_shapes,
    bench_set_stroke,
    bench_render_list_all_visible,
    bench_render_list_mostly_culled,
    bench_hit_test_miss,
    bench_hit_test_top,
    bench_remove_node,
    bench_move_node_to_index,
);
criterion_main!(benches);
