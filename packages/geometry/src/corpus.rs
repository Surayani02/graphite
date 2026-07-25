//! Deterministic fixture corpus (ADR-032 §5, Rust side).
//!
//! One definition feeds three consumers: the unit/property tests, the
//! golden snapshots (`tests/golden.rs`), and the Criterion benches. The
//! worker's fixture loader (a later Phase E step) rebuilds the same
//! shapes through `SceneGraph::add_path`; the SDF/path alternating strip
//! from the ADR's list is worker-side and lives there. Everything here is
//! seed-fixed and dependency-free — the blob uses an inline xorshift32
//! rather than a `rand` dependency (three-question rule: determinism is
//! the requirement and eleven lines meet it).
//!
//! **Invariant — no libm upstream of hashed bytes.** The golden hashes
//! demand bit-stability across platforms, and libm (`sin`/`cos`) does
//! not provide it: the 2026-07-25 Windows reference runs proved it
//! twice — first through round-join trig in the tessellated *style*
//! (fenced by [`golden_stroke`]), then through this module's own
//! `cos`/`sin` anchor generation, which flipped `blob_1024`'s *fill*
//! hash at identical counts once the rescale changed the sampled
//! inputs. Every direction here therefore comes from [`unit_dir`]:
//! half-angle identities plus binary rotation exponentiation — `sqrt`
//! and arithmetic only, all IEEE-determined, bit-identical everywhere.
//! Angles are dyadic fractions of the turn (denominator 2^20, ~6 µturn
//! grain), which is topology-identical for every fixture and exact by
//! construction.

use crate::types::{Contour, FillRule, PathGeometry, PathPoint};

/// Cubic-arc circle constant: `4/3 · tan(π/8)`.
const KAPPA: f32 = 0.552_284_8;

/// A named corpus entry.
pub struct CorpusEntry {
    /// Stable snapshot/bench identifier.
    pub name: &'static str,
    /// The geometry, fill rule included.
    pub geometry: PathGeometry,
}

/// Denominator exponent for dyadic turn angles: 2^20 ≈ 6 µturn grain.
const TURN_DENOM_LOG2: u32 = 20;

/// `(cos, sin)` of `numer / 2^TURN_DENOM_LOG2` turns, computed with
/// `sqrt` and arithmetic only — no libm, so the result is bit-identical
/// on every IEEE platform (the module invariant above). The base angle
/// comes from half-angle descent seeded at ¼ turn; the multiple comes
/// from binary exponentiation of that rotation. f64 internally, f32 out.
fn unit_dir(numer: u64) -> (f32, f32) {
    let numer = numer & ((1u64 << TURN_DENOM_LOG2) - 1); // rotation is periodic

    // Half-angle descent from ¼ turn (cos 0, sin 1) to
    // 1/2^TURN_DENOM_LOG2 turns. `sin` comes from the doubling identity
    // rearranged — sin(θ/2) = sin θ / (2·cos(θ/2)) — NOT from
    // sqrt((1 − cos θ)/2), which cancels catastrophically as cos → 1 and
    // whose residue the exponentiation below multiplies by up to 2^20.
    // The libm-oracle unit test caught exactly that (2026-07-25: 1.5e-6
    // at the half turn) before it could reach a golden.
    let mut c = 0.0f64;
    let mut s = 1.0f64;
    for _ in 2..TURN_DENOM_LOG2 {
        c = ((1.0 + c) / 2.0).sqrt();
        s /= 2.0 * c;
    }
    // result = base^numer by square-and-multiply on the rotation.
    let (mut rc, mut rs) = (1.0f64, 0.0f64);
    let (mut bc, mut bs) = (c, s);
    let mut k = numer;
    while k > 0 {
        if k & 1 == 1 {
            let t = rc * bc - rs * bs;
            rs = rc * bs + rs * bc;
            rc = t;
        }
        let t = bc * bc - bs * bs;
        bs *= 2.0 * bc;
        bc = t;
        k >>= 1;
    }
    (rc as f32, rs as f32)
}

fn one_contour(closed: bool, points: Vec<PathPoint>, fill_rule: FillRule) -> PathGeometry {
    PathGeometry {
        contours: vec![Contour { closed, points }],
        fill_rule,
    }
}

/// Closed right triangle of corner points.
pub fn triangle() -> PathGeometry {
    one_contour(
        true,
        vec![
            PathPoint::corner(0.0, 0.0),
            PathPoint::corner(120.0, 0.0),
            PathPoint::corner(0.0, 90.0),
        ],
        FillRule::NonZero,
    )
}

/// Self-intersecting five-point star ({5/2} polygon) with the given rule
/// — the §D.5-5 truth-table subject: `EvenOdd` leaves the pentagon core
/// unfilled, `NonZero` fills it.
pub fn star(fill_rule: FillRule) -> PathGeometry {
    let denom = 1u64 << TURN_DENOM_LOG2;
    let mut points = Vec::with_capacity(5);
    for k in 0..5u64 {
        // Visit circle vertices in {5/2} order: 0, 2, 4, 1, 3 — angles as
        // dyadic turns (vertex/5 − ¼, rounded to the 2^20 grain).
        let vertex = (k * 2) % 5;
        let numer = (vertex * denom + 2) / 5 + (3 * denom / 4);
        let (c, s) = unit_dir(numer);
        points.push(PathPoint::corner(200.0 * c, 200.0 * s));
    }
    one_contour(true, points, fill_rule)
}

/// One closed contour crossing itself into two lobes — curve-heavy
/// self-intersection, complementing the star's straight edges.
pub fn figure_eight() -> PathGeometry {
    one_contour(
        true,
        vec![
            PathPoint::with_handles(-150.0, 0.0, (-150.0, 160.0), (-150.0, -160.0)),
            PathPoint::with_handles(150.0, 0.0, (150.0, 160.0), (150.0, -160.0)),
        ],
        FillRule::NonZero,
    )
}

/// Four-arc cubic circle. `radius < 0` flips the winding.
fn circle(cx: f32, cy: f32, radius: f32) -> Contour {
    let r = radius.abs();
    let s = radius.signum();
    let k = KAPPA * r;
    // Cardinal anchors east → north → west → south for positive radius;
    // the sign flips the y direction, reversing the winding.
    let pts = [
        (cx + r, cy, cx + r, cy - s * k, cx + r, cy + s * k),
        (cx, cy + s * r, cx + k, cy + s * r, cx - k, cy + s * r),
        (cx - r, cy, cx - r, cy + s * k, cx - r, cy - s * k),
        (cx, cy - s * r, cx - k, cy - s * r, cx + k, cy - s * r),
    ];
    Contour {
        closed: true,
        points: pts
            .iter()
            .map(|&(x, y, ix, iy, ox, oy)| PathPoint::with_handles(x, y, (ix, iy), (ox, oy)))
            .collect(),
    }
}

/// Ring: outer circle plus opposite-winding inner circle, so the hole
/// exists under **both** fill rules (§D.5-5's "donut both").
pub fn donut(fill_rule: FillRule) -> PathGeometry {
    PathGeometry {
        contours: vec![circle(0.0, 0.0, 220.0), circle(0.0, 0.0, -110.0)],
        fill_rule,
    }
}

/// Open four-point zigzag — the cap × join matrix subject.
pub fn polyline_open() -> PathGeometry {
    one_contour(
        false,
        vec![
            PathPoint::corner(0.0, 0.0),
            PathPoint::corner(100.0, 120.0),
            PathPoint::corner(200.0, -20.0),
            PathPoint::corner(300.0, 100.0),
        ],
        FillRule::NonZero,
    )
}

/// Two very acute V spikes — the miter-limit clamp subject.
pub fn miter_spikes() -> PathGeometry {
    one_contour(
        false,
        vec![
            PathPoint::corner(0.0, 0.0),
            PathPoint::corner(100.0, 4.0),
            PathPoint::corner(0.0, 8.0),
            PathPoint::corner(100.0, 12.0),
            PathPoint::corner(0.0, 16.0),
        ],
        FillRule::NonZero,
    )
}

/// A single long cubic segment spanning a large extent — flattening
/// stress for the tolerance parameter.
pub fn long_cubic() -> PathGeometry {
    one_contour(
        false,
        vec![
            PathPoint::with_handles(0.0, 0.0, (0.0, 0.0), (1200.0, -900.0)),
            PathPoint::with_handles(3000.0, 0.0, (1800.0, 900.0), (3000.0, 0.0)),
        ],
        FillRule::NonZero,
    )
}

/// Seed-fixed smooth blob with `segments` cubic segments: anchors on a
/// circle whose radius carries **band-limited** noise, handles from
/// neighbour-chord tangents (Catmull-Rom style). `blob(1024)` is the
/// recorded 1k-segment bench/scale subject.
///
/// Two measured corrections shaped this fixture, recorded so neither
/// regresses:
///
/// 1. **Smoothness.** An early cut jittered every anchor independently;
///    at 1024 segments that is a self-intersecting noise star whose fill
///    drowns in the sweep-line's intersection events (measured 10.6 ms
///    container, ~60× the smooth form). The <4 ms target models a
///    complex but locally smooth path — pen drawings, traced artwork —
///    so the noise is harmonic: k = 2…6 at 0.22/k for the organic
///    outline, k = 12 and 24 at small amplitude for local detail.
///    Intersection-heavy *correctness* stays covered by the star and
///    figure-eight; an adversarial scaling bench joins when a target
///    exists for it.
/// 2. **Scale.** With a fixed radius, segment length shrinks as `n`
///    grows — at 1024 the chords were ~2.5 units, digitiser noise no
///    real path has, and tolerance never subdivided anything (the
///    2026-07-25 reference capture showed identical counts at 0.25 and
///    0.0156). The radius is therefore `6 × segments`: per-segment scale
///    is constant (~38-unit chords) at every `n`, so the 64/256/1024
///    rows compare complexity, not chord size, and flattening cost is
///    real.
pub fn blob(segments: u32) -> PathGeometry {
    assert!(segments >= 3, "a blob needs at least three segments");
    let mut rng = 0x9E37_79B9u32; // fixed seed — the corpus is deterministic
    let mut next_phase = move || {
        rng ^= rng << 13;
        rng ^= rng >> 17;
        rng ^= rng << 5;
        u64::from(rng >> 12) // 20 bits: a seeded phase on the dyadic-turn grid
    };

    // Outline harmonics 2…6 (0.22/k) plus detail harmonics 12 and 24.
    // Worst-case radial deviation ≈ ±0.36 — organic, never self-crossing.
    // (k, amplitude, phase numerator) — phases are dyadic turns, per the
    // module invariant.
    let mut harmonics: Vec<(u64, f32, u64)> = (2..=6u64)
        .map(|k| (k, 0.22 / k as f32, next_phase()))
        .collect();
    for (k, amp) in [(12u64, 0.03f32), (24, 0.014)] {
        harmonics.push((k, amp, next_phase()));
    }

    let n = segments as usize;
    let denom = 1u64 << TURN_DENOM_LOG2;
    let mut anchors = Vec::with_capacity(n);
    for i in 0..n {
        // Anchor angle i/n turns, on the dyadic grid.
        let numer = (i as u64 * denom + u64::from(segments) / 2) / u64::from(segments);
        let wobble: f32 = harmonics
            .iter()
            .map(|&(k, amp, phase)| amp * unit_dir(k * numer + phase).1)
            .sum();
        let radius = 6.0 * segments as f32 * (1.0 + wobble);
        let (c, s) = unit_dir(numer);
        anchors.push((radius * c, radius * s));
    }

    let mut points = Vec::with_capacity(n);
    for i in 0..n {
        let prev = anchors[(i + n - 1) % n];
        let here = anchors[i];
        let after = anchors[(i + 1) % n];
        let (tx, ty) = ((after.0 - prev.0) / 6.0, (after.1 - prev.1) / 6.0);
        points.push(PathPoint::with_handles(
            here.0,
            here.1,
            (here.0 - tx, here.1 - ty),
            (here.0 + tx, here.1 + ty),
        ));
    }
    one_contour(true, points, FillRule::NonZero)
}

/// The full named corpus, in a stable order.
pub fn corpus() -> Vec<CorpusEntry> {
    vec![
        CorpusEntry {
            name: "triangle",
            geometry: triangle(),
        },
        CorpusEntry {
            name: "star_nonzero",
            geometry: star(FillRule::NonZero),
        },
        CorpusEntry {
            name: "star_evenodd",
            geometry: star(FillRule::EvenOdd),
        },
        CorpusEntry {
            name: "figure_eight",
            geometry: figure_eight(),
        },
        CorpusEntry {
            name: "donut_nonzero",
            geometry: donut(FillRule::NonZero),
        },
        CorpusEntry {
            name: "donut_evenodd",
            geometry: donut(FillRule::EvenOdd),
        },
        CorpusEntry {
            name: "polyline_open",
            geometry: polyline_open(),
        },
        CorpusEntry {
            name: "miter_spikes",
            geometry: miter_spikes(),
        },
        CorpusEntry {
            name: "long_cubic",
            geometry: long_cubic(),
        },
        CorpusEntry {
            name: "blob_1024",
            geometry: blob(1024),
        },
    ]
}

/// Canonical stroke style for benches and the cap × join coverage: round
/// ends and joins exercise the arc paths, which is what a representative
/// stroke *costs*. Golden **hashes** use [`golden_stroke`] instead — see
/// its rationale.
pub fn default_stroke() -> crate::types::StrokeStyle {
    crate::types::StrokeStyle {
        width: 4.0,
        cap: crate::types::LineCap::Round,
        join: crate::types::LineJoin::Round,
        miter_limit: 4.0,
    }
}

/// Trig-free stroke style for golden **hashes**: square caps and miter
/// joins are pure arithmetic (`sqrt` is IEEE-exact everywhere), so the
/// quantised-position hash is bit-stable across platforms. Round
/// caps/joins go through libm trig, and the 2026-07-25 reference capture
/// proved the consequence: on `blob_1024`'s ~1024 round joins, Windows
/// and Linux libm ulps crossed a 1e-3 quantisation boundary somewhere —
/// identical counts, different hash. Arc generation stays golden-held by
/// counts-only snapshot lines (counts measured platform-stable) and by
/// visual Net 2, whose thresholds absorb ulps by design.
pub fn golden_stroke() -> crate::types::StrokeStyle {
    crate::types::StrokeStyle {
        width: 4.0,
        cap: crate::types::LineCap::Square,
        join: crate::types::LineJoin::Miter,
        miter_limit: 4.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unit_dir_matches_libm_within_tolerance() {
        // libm is an unfit *bit-stability* foundation (module invariant)
        // but a perfectly good *accuracy* oracle: unit_dir must agree with
        // it to well under the 1e-3 golden quantisation grain.
        let denom = (1u64 << TURN_DENOM_LOG2) as f64;
        // The bar is f32 resolution (~1e-7), not the f64 path's ~1e-14
        // headroom: it must fail on a real accuracy regression — the
        // 1.5e-6 cancellation bug this test caught — without tracking
        // harmless last-bit drift.
        for numer in [0u64, 1, 12_345, 262_144, 524_288, 786_432, 1_048_575] {
            let angle = std::f64::consts::TAU * (numer as f64) / denom;
            let (c, sn) = unit_dir(numer);
            assert!(
                (f64::from(c) - angle.cos()).abs() < 1e-7,
                "cos({numer}): {c} vs {}",
                angle.cos()
            );
            assert!(
                (f64::from(sn) - angle.sin()).abs() < 1e-7,
                "sin({numer}): {sn} vs {}",
                angle.sin()
            );
        }
    }

    #[test]
    fn unit_dir_is_on_the_unit_circle_and_periodic() {
        let denom = 1u64 << TURN_DENOM_LOG2;
        for numer in [0u64, 7, 1_000, denom / 3, denom - 1] {
            let (c, s) = unit_dir(numer);
            let length = (f64::from(c).powi(2) + f64::from(s).powi(2)).sqrt();
            assert!((length - 1.0).abs() < 1e-6, "|dir({numer})| = {length}");
            assert_eq!(unit_dir(numer), unit_dir(numer + denom), "periodicity");
        }
    }

    #[test]
    fn star_points_lie_on_the_declared_radius() {
        let g = star(FillRule::NonZero);
        assert_eq!(g.contours[0].points.len(), 5);
        for p in &g.contours[0].points {
            let r = (f64::from(p.x).powi(2) + f64::from(p.y).powi(2)).sqrt();
            assert!((r - 200.0).abs() < 1e-3, "radius {r}");
        }
    }

    #[test]
    fn blob_is_seed_deterministic() {
        assert_eq!(blob(64), blob(64));
        assert_eq!(blob(64).contours[0].points.len(), 64);
    }

    #[test]
    fn corpus_names_are_unique() {
        let entries = corpus();
        let mut names: Vec<_> = entries.iter().map(|e| e.name).collect();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), entries.len());
    }
}
