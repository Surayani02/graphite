//! Fill tessellation — the lyon fill adapter (§D.1, ADR-031).

use crate::convert::{to_lyon_path, validate};
use crate::types::{FillRule, Mesh, PathGeometry, TessellationError};
use lyon_tessellation::{
    BuffersBuilder, FillOptions, FillTessellator, FillVertex, GeometryBuilderError,
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

/// Tessellates the interior of `geometry` into a triangle mesh.
///
/// `tolerance` is the maximum distance, in the path's local units,
/// between a true curve and its flattened approximation — the worker
/// derives it from the zoom bucket so error stays ≤ ¼ device pixel
/// (ADR-032 §4). Open contours are implicitly closed (SVG semantics).
///
/// Zero-area geometry — collinear or fully coincident contours — returns
/// [`TessellationError::Degenerate`] via the empty-output rule: lyon is
/// the authority on what has ink, and an inkless result is a
/// classification, never a panic.
pub fn tessellate_fill(geometry: &PathGeometry, tolerance: f32) -> Result<Mesh, TessellationError> {
    validate(geometry)?;
    if !(tolerance.is_finite() && tolerance > 0.0) {
        return Err(TessellationError::Degenerate);
    }

    let path = to_lyon_path(geometry);
    let options = FillOptions::tolerance(tolerance).with_fill_rule(match geometry.fill_rule {
        FillRule::NonZero => lyon_tessellation::FillRule::NonZero,
        FillRule::EvenOdd => lyon_tessellation::FillRule::EvenOdd,
    });

    let mut buffers: VertexBuffers<[f32; 2], u32> = VertexBuffers::new();
    let mut tessellator = FillTessellator::new();
    tessellator
        .tessellate_path(
            &path,
            &options,
            &mut BuffersBuilder::new(&mut buffers, |vertex: FillVertex| {
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
    use crate::corpus::{blob, donut, polyline_open, star, triangle};
    use crate::types::{Contour, PathPoint};

    /// Unsigned area of a triangle-list mesh.
    fn area(mesh: &Mesh) -> f32 {
        mesh.indices
            .chunks_exact(3)
            .map(|t| {
                let p = |i: u32| {
                    let i = i as usize;
                    (mesh.positions[2 * i], mesh.positions[2 * i + 1])
                };
                let (a, b, c) = (p(t[0]), p(t[1]), p(t[2]));
                ((b.0 - a.0) * (c.1 - a.1) - (c.0 - a.0) * (b.1 - a.1)).abs() / 2.0
            })
            .sum()
    }

    #[test]
    fn triangle_fill_has_expected_area() {
        let mesh = tessellate_fill(&triangle(), 0.25).expect("fill");
        assert!((area(&mesh) - 5400.0).abs() < 1.0); // 120 × 90 / 2
    }

    #[test]
    fn fill_rule_truth_table_star() {
        // §D.5-5: the evenodd star has a hole (the pentagon core), the
        // nonzero star does not — strictly more filled area.
        let nz = area(&tessellate_fill(&star(FillRule::NonZero), 0.05).expect("nz"));
        let eo = area(&tessellate_fill(&star(FillRule::EvenOdd), 0.05).expect("eo"));
        assert!(nz > eo * 1.05, "nonzero {nz} should exceed evenodd {eo}");
    }

    #[test]
    fn fill_rule_truth_table_donut() {
        // §D.5-5: the donut holes under BOTH rules (opposite windings),
        // so both areas sit well below the outer disc's.
        let outer = PathGeometry {
            contours: donut(FillRule::NonZero).contours[..1].to_vec(),
            fill_rule: FillRule::NonZero,
        };
        let disc = area(&tessellate_fill(&outer, 0.05).expect("disc"));
        let nz = area(&tessellate_fill(&donut(FillRule::NonZero), 0.05).expect("nz"));
        let eo = area(&tessellate_fill(&donut(FillRule::EvenOdd), 0.05).expect("eo"));
        assert!(
            nz < disc * 0.85 && eo < disc * 0.85,
            "nz {nz} / eo {eo} vs disc {disc}"
        );
        assert!(
            (nz - eo).abs() < disc * 0.01,
            "both rules agree on the ring"
        );
    }

    #[test]
    fn open_contours_fill_as_implicitly_closed() {
        let mesh = tessellate_fill(&polyline_open(), 0.25).expect("fill");
        assert!(area(&mesh) > 0.0);
    }

    #[test]
    fn collinear_closed_contour_is_degenerate() {
        let g = PathGeometry {
            contours: vec![Contour {
                closed: true,
                points: vec![
                    PathPoint::corner(0.0, 0.0),
                    PathPoint::corner(50.0, 0.0),
                    PathPoint::corner(100.0, 0.0),
                ],
            }],
            fill_rule: FillRule::NonZero,
        };
        assert_eq!(
            tessellate_fill(&g, 0.25),
            Err(TessellationError::Degenerate)
        );
    }

    #[test]
    fn invalid_tolerance_is_degenerate() {
        for tol in [0.0f32, -1.0, f32::NAN] {
            assert_eq!(
                tessellate_fill(&triangle(), tol),
                Err(TessellationError::Degenerate)
            );
        }
    }

    #[test]
    fn blob_scales_without_error() {
        let mesh = tessellate_fill(&blob(64), 0.25).expect("fill");
        assert!(mesh.vertex_count() > 64);
        assert_eq!(mesh.positions.len(), mesh.vertex_count() * 2);
    }
}
