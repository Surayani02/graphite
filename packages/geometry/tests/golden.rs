//! Golden mesh snapshots — Net 1 of the M1 golden strategy (ADR-032
//! Consequences; design doc §F), plus the corpus-wide determinism and
//! bounds-containment properties.
//!
//! Each corpus entry owns `tests/goldens/<name>.snap`. Per tolerance:
//! a `fill` and a `stroke` line carrying counts plus an FNV-1a 64 hash
//! of the positions **quantised at 1e-3** and the raw indices, and a
//! `stroke_round` line carrying **counts only**. The hashed stroke uses
//! [`golden_stroke`] — square caps, miter joins, pure arithmetic —
//! because hashes must be bit-stable across platforms and libm trig is
//! not: the 2026-07-25 Windows reference run flipped `blob_1024`'s
//! round-join stroke hash at identical counts (one of ~6k quantised
//! coordinates crossed a 1e-3 boundary); a second run then flipped the
//! blob's *fill* hash through the corpus generator's own `cos`/`sin` —
//! fenced since by `corpus::unit_dir` (see the corpus module invariant:
//! no libm anywhere upstream of hashed bytes). Round-arc geometry is
//! held by the counts-only line (counts proved platform-stable in both
//! runs) and by visual Net 2's thresholds. CI runs this suite on
//! Windows as well as Linux, so drift of this class fails in CI rather
//! than by hand. Any real geometry drift — a
//! lyon upgrade, a conversion change — moves counts or a hash and fails
//! loudly.
//!
//! Regeneration (after an *intentional* geometry change only):
//!
//! ```text
//! GOLDEN_UPDATE=1 cargo test -p graphite-geometry --test golden
//! ```
//!
//! then commit the rewritten `.snap` files with the change that explains
//! them.

use graphite_geometry::corpus::{corpus, default_stroke, golden_stroke};
use graphite_geometry::{bounds, tessellate_fill, tessellate_stroke, Mesh};
use std::fmt::Write as _;
use std::path::PathBuf;

const TOLERANCES: [f32; 2] = [0.25, 0.015_625]; // bucket 0 and bucket 4

fn quantise(value: f32) -> i64 {
    (f64::from(value) * 1000.0).round() as i64
}

fn fnv1a64(mesh: &Mesh) -> u64 {
    let mut hash = 0xcbf2_9ce4_8422_2325u64;
    let mut eat = |byte: u8| {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    };
    for &p in &mesh.positions {
        for byte in quantise(p).to_le_bytes() {
            eat(byte);
        }
    }
    for &i in &mesh.indices {
        for byte in i.to_le_bytes() {
            eat(byte);
        }
    }
    hash
}

fn snapshot_of(name: &str) -> String {
    let entry = corpus()
        .into_iter()
        .find(|e| e.name == name)
        .unwrap_or_else(|| panic!("no corpus entry named {name}"));
    let hashed_style = golden_stroke();
    let round_style = default_stroke();
    let mut out = String::new();
    for tolerance in TOLERANCES {
        let fill = tessellate_fill(&entry.geometry, tolerance)
            .unwrap_or_else(|e| panic!("{name}: fill tol={tolerance}: {e}"));
        let stroke = tessellate_stroke(&entry.geometry, &hashed_style, tolerance)
            .unwrap_or_else(|e| panic!("{name}: stroke tol={tolerance}: {e}"));
        for (part, mesh) in [("fill", &fill), ("stroke", &stroke)] {
            writeln!(
                out,
                "{part} tol={tolerance} v={} i={} hash={:016x}",
                mesh.vertex_count(),
                mesh.indices.len(),
                fnv1a64(mesh)
            )
            .expect("string write");
        }
        let round = tessellate_stroke(&entry.geometry, &round_style, tolerance)
            .unwrap_or_else(|e| panic!("{name}: stroke_round tol={tolerance}: {e}"));
        writeln!(
            out,
            "stroke_round tol={tolerance} v={} i={}",
            round.vertex_count(),
            round.indices.len()
        )
        .expect("string write");
    }
    out
}

fn golden_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests/goldens")
        .join(format!("{name}.snap"))
}

#[test]
fn golden_meshes_match_snapshots() {
    let update = std::env::var_os("GOLDEN_UPDATE").is_some();
    let mut failures = Vec::new();

    for entry in corpus() {
        let actual = snapshot_of(entry.name);
        let path = golden_path(entry.name);
        if update {
            std::fs::write(&path, &actual)
                .unwrap_or_else(|e| panic!("writing {}: {e}", path.display()));
            continue;
        }
        match std::fs::read_to_string(&path) {
            Ok(expected) if expected == actual => {}
            Ok(expected) => failures.push(format!(
                "{}: snapshot drift\n--- expected\n{expected}--- actual\n{actual}",
                entry.name
            )),
            Err(_) => failures.push(format!(
                "{}: missing {} — run GOLDEN_UPDATE=1 cargo test -p graphite-geometry --test golden",
                entry.name,
                path.display()
            )),
        }
    }

    assert!(
        failures.is_empty(),
        "golden failures:\n{}",
        failures.join("\n")
    );
}

#[test]
fn tessellation_is_deterministic() {
    let style = default_stroke();
    for entry in corpus() {
        let a = tessellate_fill(&entry.geometry, 0.25).expect("fill");
        let b = tessellate_fill(&entry.geometry, 0.25).expect("fill");
        assert_eq!(a, b, "{}: fill not deterministic", entry.name);
        let a = tessellate_stroke(&entry.geometry, &style, 0.25).expect("stroke");
        let b = tessellate_stroke(&entry.geometry, &style, 0.25).expect("stroke");
        assert_eq!(a, b, "{}: stroke not deterministic", entry.name);
    }
}

#[test]
fn bounds_contain_flattened_fill_extents() {
    for entry in corpus() {
        let rect = bounds(&entry.geometry).expect("corpus geometry has bounds");
        // Fine tolerance → the flattened mesh hugs the true curve.
        let mesh = tessellate_fill(&entry.geometry, 0.015_625).expect("fill");
        let eps = 1e-3f32;
        for xy in mesh.positions.chunks_exact(2) {
            let inside = xy[0] >= rect[0] - eps
                && xy[0] <= rect[0] + rect[2] + eps
                && xy[1] >= rect[1] - eps
                && xy[1] <= rect[1] + rect[3] + eps;
            assert!(
                inside,
                "{}: mesh vertex ({}, {}) escapes bounds {rect:?}",
                entry.name, xy[0], xy[1]
            );
        }
    }
}
