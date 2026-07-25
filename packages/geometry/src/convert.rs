//! `PathGeometry` → `lyon_path::Path` conversion and the structural
//! validation both tessellators share. Private: lyon types never appear
//! in the crate's public surface (§B.1 — the engine sees only §D.1).

use crate::types::{Contour, PathGeometry, PathPoint, TessellationError};
use lyon_path::math::point;
use lyon_path::Path;

/// Structural validation, identical for fill and stroke: at least one
/// contour, every contour ≥ 2 points, every coordinate finite. Ink-level
/// degeneracy (zero area, zero length) is classified *after* tessellation
/// by the empty-output rule in `fill`/`stroke` — lyon decides what has
/// ink; this only rejects inputs it cannot safely be handed.
pub(crate) fn validate(geometry: &PathGeometry) -> Result<(), TessellationError> {
    if geometry.contours.is_empty() {
        return Err(TessellationError::Degenerate);
    }
    for contour in &geometry.contours {
        if contour.points.len() < 2 {
            return Err(TessellationError::Degenerate);
        }
        for p in &contour.points {
            let finite = p.x.is_finite()
                && p.y.is_finite()
                && p.h_in_x.is_finite()
                && p.h_in_y.is_finite()
                && p.h_out_x.is_finite()
                && p.h_out_y.is_finite();
            if !finite {
                return Err(TessellationError::Degenerate);
            }
        }
    }
    Ok(())
}

/// True when the segment `a → b` carries no curvature: both governing
/// handles sit on their anchors, so the exact segment is a line.
fn is_line(a: &PathPoint, b: &PathPoint) -> bool {
    a.h_out_x == a.x && a.h_out_y == a.y && b.h_in_x == b.x && b.h_in_y == b.y
}

fn emit_segment(builder: &mut lyon_path::path::Builder, a: &PathPoint, b: &PathPoint) {
    if is_line(a, b) {
        builder.line_to(point(b.x, b.y));
    } else {
        builder.cubic_bezier_to(
            point(a.h_out_x, a.h_out_y),
            point(b.h_in_x, b.h_in_y),
            point(b.x, b.y),
        );
    }
}

fn emit_contour(builder: &mut lyon_path::path::Builder, contour: &Contour) {
    let points = &contour.points;
    let first = &points[0];
    builder.begin(point(first.x, first.y));
    for pair in points.windows(2) {
        emit_segment(builder, &pair[0], &pair[1]);
    }
    if contour.closed {
        // The wrap segment (last → first) may curve; `end(true)` alone
        // closes with a *line*. Emit the curved wrap explicitly, then
        // close — the closing line collapses to zero length at the shared
        // point and lyon tolerates it. A straight wrap is left to the
        // close itself.
        let last = &points[points.len() - 1];
        if !is_line(last, first) {
            emit_segment(builder, last, first);
        }
        builder.end(true);
    } else {
        builder.end(false);
    }
}

/// Builds the lyon path. Callers run [`validate`] first; this cannot fail.
pub(crate) fn to_lyon_path(geometry: &PathGeometry) -> Path {
    let mut builder = Path::builder();
    for contour in &geometry.contours {
        emit_contour(&mut builder, contour);
    }
    builder.build()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::FillRule;

    fn geometry(points: Vec<PathPoint>) -> PathGeometry {
        PathGeometry {
            contours: vec![Contour {
                closed: true,
                points,
            }],
            fill_rule: FillRule::NonZero,
        }
    }

    #[test]
    fn validate_rejects_empty_geometry() {
        let g = PathGeometry {
            contours: vec![],
            fill_rule: FillRule::NonZero,
        };
        assert_eq!(validate(&g), Err(TessellationError::Degenerate));
    }

    #[test]
    fn validate_rejects_single_point_contours() {
        let g = geometry(vec![PathPoint::corner(0.0, 0.0)]);
        assert_eq!(validate(&g), Err(TessellationError::Degenerate));
    }

    #[test]
    fn validate_rejects_non_finite_coordinates() {
        for bad in [f32::NAN, f32::INFINITY, f32::NEG_INFINITY] {
            let g = geometry(vec![
                PathPoint::corner(0.0, 0.0),
                PathPoint::with_handles(1.0, 1.0, (bad, 0.0), (1.0, 1.0)),
                PathPoint::corner(2.0, 0.0),
            ]);
            assert_eq!(
                validate(&g),
                Err(TessellationError::Degenerate),
                "bad = {bad}"
            );
        }
    }

    #[test]
    fn corner_segments_are_lines() {
        let a = PathPoint::corner(0.0, 0.0);
        let b = PathPoint::corner(1.0, 0.0);
        assert!(is_line(&a, &b));
        let curved = PathPoint::with_handles(1.0, 0.0, (0.5, 1.0), (1.0, 0.0));
        assert!(!is_line(&a, &curved));
    }
}
