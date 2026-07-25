//! Stroke tessellation — the lyon stroke adapter (§D.1, ADR-031).

use crate::convert::{to_lyon_path, validate};
use crate::types::{LineCap, LineJoin, Mesh, PathGeometry, StrokeStyle, TessellationError};
use lyon_tessellation::{
    BuffersBuilder, GeometryBuilderError, StrokeOptions, StrokeTessellator, StrokeVertex,
    TessellationError as LyonError, VertexBuffers,
};

fn map_error(error: LyonError) -> TessellationError {
    match error {
        LyonError::GeometryBuilder(GeometryBuilderError::TooManyVertices) => {
            TessellationError::TooManyVertices
        }
        other => TessellationError::Internal(other.to_string()),
    }
}

/// Tessellates the centre-aligned stroke of `geometry` into a triangle
/// mesh. `tolerance` has fill's semantics (ADR-032 §4); `style` supplies
/// width, caps, join, and the miter limit (a ratio of width — joins
/// sharper than the limit fall back to bevel, lyon semantics). Dash
/// patterns are out of scope until C1.15 lands in M2+ (ADR-032).
///
/// Zero-length geometry — every point coincident — produces no ink and
/// returns [`TessellationError::Degenerate`] via the empty-output rule.
/// A collinear contour is a *valid* stroke (a line has one).
pub fn tessellate_stroke(
    geometry: &PathGeometry,
    style: &StrokeStyle,
    tolerance: f32,
) -> Result<Mesh, TessellationError> {
    validate(geometry)?;
    let width_valid = style.width.is_finite() && style.width > 0.0;
    let limit_valid = style.miter_limit.is_finite() && style.miter_limit >= 1.0;
    if !(tolerance.is_finite() && tolerance > 0.0 && width_valid && limit_valid) {
        return Err(TessellationError::Degenerate);
    }

    let path = to_lyon_path(geometry);
    let options = StrokeOptions::tolerance(tolerance)
        .with_line_width(style.width)
        .with_line_cap(match style.cap {
            LineCap::Butt => lyon_tessellation::LineCap::Butt,
            LineCap::Round => lyon_tessellation::LineCap::Round,
            LineCap::Square => lyon_tessellation::LineCap::Square,
        })
        .with_line_join(match style.join {
            LineJoin::Miter => lyon_tessellation::LineJoin::Miter,
            LineJoin::Round => lyon_tessellation::LineJoin::Round,
            LineJoin::Bevel => lyon_tessellation::LineJoin::Bevel,
        })
        .with_miter_limit(style.miter_limit);

    let mut buffers: VertexBuffers<[f32; 2], u32> = VertexBuffers::new();
    let mut tessellator = StrokeTessellator::new();
    tessellator
        .tessellate_path(
            &path,
            &options,
            &mut BuffersBuilder::new(&mut buffers, |vertex: StrokeVertex| {
                vertex.position().to_array()
            }),
        )
        .map_err(map_error)?;

    if buffers.indices.is_empty() {
        return Err(TessellationError::Degenerate);
    }
    Ok(Mesh {
        positions: buffers
            .vertices
            .iter()
            .flat_map(|xy| [xy[0], xy[1]])
            .collect(),
        indices: buffers.indices,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::corpus::{miter_spikes, polyline_open};
    use crate::types::{Contour, FillRule, PathPoint};

    fn style(cap: LineCap, join: LineJoin, miter_limit: f32) -> StrokeStyle {
        StrokeStyle {
            width: 4.0,
            cap,
            join,
            miter_limit,
        }
    }

    fn max_x(mesh: &Mesh) -> f32 {
        mesh.positions
            .chunks_exact(2)
            .map(|xy| xy[0])
            .fold(f32::NEG_INFINITY, f32::max)
    }

    #[test]
    fn cap_join_matrix_produces_finite_meshes() {
        let caps = [LineCap::Butt, LineCap::Round, LineCap::Square];
        let joins = [LineJoin::Miter, LineJoin::Round, LineJoin::Bevel];
        for cap in caps {
            for join in joins {
                let mesh = tessellate_stroke(&polyline_open(), &style(cap, join, 4.0), 0.25)
                    .unwrap_or_else(|e| panic!("{cap:?}/{join:?}: {e}"));
                assert!(!mesh.indices.is_empty(), "{cap:?}/{join:?}: empty");
                assert!(
                    mesh.positions.iter().all(|v| v.is_finite()),
                    "{cap:?}/{join:?}: non-finite vertex"
                );
            }
        }
    }

    #[test]
    fn miter_limit_clamps_spikes() {
        // The spikes point in +x; a generous limit lets miters extend
        // well past the anchors at x = 100, a tight limit bevels them.
        let sharp = tessellate_stroke(
            &miter_spikes(),
            &style(LineCap::Butt, LineJoin::Miter, 20.0),
            0.25,
        )
        .expect("sharp");
        let clamped = tessellate_stroke(
            &miter_spikes(),
            &style(LineCap::Butt, LineJoin::Miter, 1.05),
            0.25,
        )
        .expect("clamped");
        assert!(
            max_x(&sharp) > max_x(&clamped) + 1.0,
            "sharp {} should out-reach clamped {}",
            max_x(&sharp),
            max_x(&clamped)
        );
    }

    #[test]
    fn collinear_line_strokes_fine() {
        let g = PathGeometry {
            contours: vec![Contour {
                closed: false,
                points: vec![PathPoint::corner(0.0, 0.0), PathPoint::corner(100.0, 0.0)],
            }],
            fill_rule: FillRule::NonZero,
        };
        let mesh =
            tessellate_stroke(&g, &style(LineCap::Butt, LineJoin::Miter, 4.0), 0.25).expect("ok");
        assert!(!mesh.indices.is_empty());
    }

    #[test]
    fn coincident_points_are_degenerate() {
        let g = PathGeometry {
            contours: vec![Contour {
                closed: true,
                points: vec![PathPoint::corner(5.0, 5.0), PathPoint::corner(5.0, 5.0)],
            }],
            fill_rule: FillRule::NonZero,
        };
        assert_eq!(
            tessellate_stroke(&g, &style(LineCap::Butt, LineJoin::Miter, 4.0), 0.25),
            Err(TessellationError::Degenerate)
        );
    }

    #[test]
    fn invalid_style_is_degenerate() {
        let cases = [
            StrokeStyle {
                width: 0.0,
                cap: LineCap::Butt,
                join: LineJoin::Miter,
                miter_limit: 4.0,
            },
            StrokeStyle {
                width: f32::NAN,
                cap: LineCap::Butt,
                join: LineJoin::Miter,
                miter_limit: 4.0,
            },
            StrokeStyle {
                width: 4.0,
                cap: LineCap::Butt,
                join: LineJoin::Miter,
                miter_limit: 0.5,
            },
        ];
        for s in cases {
            assert_eq!(
                tessellate_stroke(&polyline_open(), &s, 0.25),
                Err(TessellationError::Degenerate),
                "{s:?}"
            );
        }
    }
}
