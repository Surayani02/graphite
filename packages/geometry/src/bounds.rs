//! Control-polygon bounds (§D.1) — conservative, cull-grade.

use crate::types::PathGeometry;

/// Axis-aligned bounds of the control polygon: every anchor *and* every
/// handle, across all contours, as `[x, y, w, h]`.
///
/// A cubic Bézier lies within the convex hull of its four control
/// points, so this rectangle always contains the true ink extents of the
/// **fill** — conservative, never smaller, and exact enough for culling
/// (§B.2's path-reference record). It deliberately excludes stroke
/// inflation: width/2, caps, and miter spikes are the caller's to add
/// (the engine does, next step in the Phase E plan), because bounds of
/// the same geometry differ per stroke style while this function is a
/// property of the geometry alone.
///
/// Returns `None` for empty geometry or any non-finite coordinate — the
/// same inputs the tessellators classify as degenerate.
pub fn bounds(geometry: &PathGeometry) -> Option<[f32; 4]> {
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    let mut any = false;

    for contour in &geometry.contours {
        for p in &contour.points {
            for (x, y) in [(p.x, p.y), (p.h_in_x, p.h_in_y), (p.h_out_x, p.h_out_y)] {
                if !(x.is_finite() && y.is_finite()) {
                    return None;
                }
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x);
                max_y = max_y.max(y);
                any = true;
            }
        }
    }

    if !any {
        return None;
    }
    Some([min_x, min_y, max_x - min_x, max_y - min_y])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::corpus::{long_cubic, triangle};
    use crate::types::FillRule;

    #[test]
    fn triangle_bounds_are_exact() {
        assert_eq!(bounds(&triangle()), Some([0.0, 0.0, 120.0, 90.0]));
    }

    #[test]
    fn handles_extend_bounds() {
        // long_cubic's anchors sit at y = 0; only its handles reach ±900.
        let rect = bounds(&long_cubic()).expect("bounds");
        assert_eq!(rect[1], -900.0);
        assert_eq!(rect[3], 1800.0);
    }

    #[test]
    fn empty_and_non_finite_are_none() {
        let empty = PathGeometry {
            contours: vec![],
            fill_rule: FillRule::NonZero,
        };
        assert_eq!(bounds(&empty), None);

        let mut g = triangle();
        g.contours[0].points[1].h_out_x = f32::NAN;
        assert_eq!(bounds(&g), None);
    }
}
