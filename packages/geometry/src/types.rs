//! Path data model — the §D.1 contract types (ADR-031).
//!
//! Plain data, no lyon types in the public surface: the engine stores
//! these on `NodeKind::Path` (next step in the Phase E plan) and the
//! tessellators in [`crate::fill`] / [`crate::stroke`] consume them.
//! Validation lives at the tessellation boundary, not in constructors —
//! these are records, and the engine's flat-encoding decoder builds them
//! directly.

/// Anchor with absolute-coordinate handles.
///
/// A corner point is exactly `h_in == h_out == anchor` — no `Option`
/// branches in the math. The segment from point `a` to point `b` is the
/// cubic Bézier with control points `a.h_out` and `b.h_in`; when both
/// coincide with their anchors the segment is emitted as an exact line.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PathPoint {
    /// Anchor x.
    pub x: f32,
    /// Anchor y.
    pub y: f32,
    /// Incoming handle x (absolute).
    pub h_in_x: f32,
    /// Incoming handle y (absolute).
    pub h_in_y: f32,
    /// Outgoing handle x (absolute).
    pub h_out_x: f32,
    /// Outgoing handle y (absolute).
    pub h_out_y: f32,
}

impl PathPoint {
    /// A corner point: both handles collapsed onto the anchor.
    pub fn corner(x: f32, y: f32) -> Self {
        Self {
            x,
            y,
            h_in_x: x,
            h_in_y: y,
            h_out_x: x,
            h_out_y: y,
        }
    }

    /// A point with explicit absolute handles.
    pub fn with_handles(x: f32, y: f32, h_in: (f32, f32), h_out: (f32, f32)) -> Self {
        Self {
            x,
            y,
            h_in_x: h_in.0,
            h_in_y: h_in.1,
            h_out_x: h_out.0,
            h_out_y: h_out.1,
        }
    }

    /// True when both handles coincide with the anchor.
    pub fn is_corner(&self) -> bool {
        self.h_in_x == self.x
            && self.h_in_y == self.y
            && self.h_out_x == self.x
            && self.h_out_y == self.y
    }
}

/// One sub-path. `points.len() >= 2` is required by the tessellators
/// (fewer is [`TessellationError::Degenerate`]); an open contour is
/// implicitly closed when filled (SVG semantics) and capped when stroked.
#[derive(Debug, Clone, PartialEq)]
pub struct Contour {
    /// Closed sub-paths connect the last point back to the first.
    pub closed: bool,
    /// Anchor/handle sequence, in paint order.
    pub points: Vec<PathPoint>,
}

/// Fill rule for self-intersecting and multi-contour geometry.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FillRule {
    /// Winding-number rule — overlapping windings merge.
    NonZero,
    /// Parity rule — overlapping windings alternate holes.
    EvenOdd,
}

/// A complete path: contours plus the rule that decides its interior.
#[derive(Debug, Clone, PartialEq)]
pub struct PathGeometry {
    /// Sub-paths, in paint order.
    pub contours: Vec<Contour>,
    /// Interior rule (§D.5-5 truth table is the contract).
    pub fill_rule: FillRule,
}

/// Stroke end-cap shape.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LineCap {
    /// Squared off at the endpoint.
    Butt,
    /// Semicircle beyond the endpoint.
    Round,
    /// Square extended half a width beyond the endpoint.
    Square,
}

/// Stroke corner shape.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LineJoin {
    /// Sharp corner, clamped by `miter_limit`.
    Miter,
    /// Rounded corner.
    Round,
    /// Cut corner.
    Bevel,
}

/// Stroke parameters — centre-aligned solid stroke only (PARITY C1.15's
/// current scope). Dash patterns are deliberately absent: they need
/// lyon_algorithms' path measure and land with C1.15 in M2+ (ADR-032).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct StrokeStyle {
    /// Full stroke width in path-local units.
    pub width: f32,
    /// End-cap shape for open contours.
    pub cap: LineCap,
    /// Corner shape.
    pub join: LineJoin,
    /// Miter length limit as a ratio of stroke width (lyon semantics).
    pub miter_limit: f32,
}

/// Triangle mesh in the path's local frame. `positions` is xy-interleaved
/// (`2 × vertex_count` floats); `indices` is triangle-list, three per
/// triangle. Uploaded verbatim as `float32x2` vertex + `u32` index
/// buffers (ADR-032 §7).
#[derive(Debug, Clone, PartialEq)]
pub struct Mesh {
    /// Interleaved x,y vertex positions.
    pub positions: Vec<f32>,
    /// Triangle-list indices into `positions / 2`.
    pub indices: Vec<u32>,
}

impl Mesh {
    /// Vertex count (`positions.len() / 2`).
    pub fn vertex_count(&self) -> usize {
        self.positions.len() / 2
    }
}

/// Tessellation failure. `Degenerate` is a *classification*, not a panic:
/// inputs with no ink (too few points, non-finite coordinates, zero-area
/// fills, zero-length strokes) report it and the caller skips the draw.
#[derive(Debug, Clone, PartialEq)]
pub enum TessellationError {
    /// The geometry has no ink under the requested operation.
    Degenerate,
    /// lyon's vertex-id space overflowed — the mesh cannot be indexed.
    TooManyVertices,
    /// Any other tessellator-internal failure, with lyon's description.
    Internal(String),
}

impl std::fmt::Display for TessellationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Degenerate => write!(f, "degenerate geometry: nothing to tessellate"),
            Self::TooManyVertices => write!(f, "tessellation exceeded the vertex-id space"),
            Self::Internal(detail) => write!(f, "tessellator failure: {detail}"),
        }
    }
}

impl std::error::Error for TessellationError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn corner_collapses_both_handles() {
        let p = PathPoint::corner(3.0, -4.0);
        assert!(p.is_corner());
        assert_eq!(
            (p.h_in_x, p.h_in_y, p.h_out_x, p.h_out_y),
            (3.0, -4.0, 3.0, -4.0)
        );
    }

    #[test]
    fn with_handles_is_not_a_corner() {
        let p = PathPoint::with_handles(0.0, 0.0, (-1.0, 0.0), (1.0, 0.0));
        assert!(!p.is_corner());
    }

    #[test]
    fn mesh_vertex_count_is_position_pairs() {
        let mesh = Mesh {
            positions: vec![0.0; 8],
            indices: vec![0, 1, 2],
        };
        assert_eq!(mesh.vertex_count(), 4);
    }

    #[test]
    fn errors_display_without_panicking() {
        for e in [
            TessellationError::Degenerate,
            TessellationError::TooManyVertices,
            TessellationError::Internal("detail".into()),
        ] {
            assert!(!e.to_string().is_empty());
        }
    }
}
