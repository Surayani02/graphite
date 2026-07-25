use crate::math::{color::Color, rect::Rect};
use graphite_geometry::{PathGeometry, StrokeStyle};

/// Opaque, arena-stable node identifier.
/// The inner `u32` is the index into `SceneGraph::nodes`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct NodeId(pub u32);

/// Semantic kind of a scene node.
#[derive(Debug, Clone)]
pub enum NodeKind {
    /// Transparent container.  Groups children; never rendered.
    Frame,

    /// Filled and/or stroked axis-aligned rectangle.
    ///
    /// `stroke.a == 0`    → no visible stroke (default).
    /// `corner_radius == 0.0` → sharp corners (default).
    Rect {
        fill: Color,
        stroke: Color,
        stroke_width: f32,
        corner_radius: f32,
    },

    /// Filled and/or stroked ellipse.
    /// When `bounds.w == bounds.h` the shape is a perfect circle.
    ///
    /// `stroke.a == 0` → no visible stroke (default).
    Ellipse {
        fill: Color,
        stroke: Color,
        stroke_width: f32,
    },

    /// Arbitrary vector path — Phase 8 M1 (ADR-031/032).
    ///
    /// Rendered through tessellated meshes rather than the SDF pipeline,
    /// so the fields the SDF shader reads (`corner_radius`) have no
    /// analogue here.
    ///
    /// `geometry` is in **node-local** coordinates and `origin` places
    /// that frame in world space: a move updates `origin` only, so cached
    /// meshes survive it (ADR-032 §7). `bounds` (on [`SceneNode`]) stays
    /// the world-space control-polygon rectangle used for culling and
    /// hit-testing.
    ///
    /// `geometry_version` starts at 1 and increments on every edit that
    /// invalidates a tessellated mesh — the host's cache key (ADR-032 §4).
    /// It is deliberately bumped by stroke-parameter changes too: the
    /// stroke mesh depends on width, cap, join, and miter limit, and one
    /// conservative counter is cheaper to reason about than per-part
    /// versioning, which M3's boolean groups would have to keep in step.
    Path {
        geometry: PathGeometry,
        fill: Color,
        stroke: Color,
        stroke_style: StrokeStyle,
        origin_x: f32,
        origin_y: f32,
        geometry_version: u32,
    },
}

/// One node in the scene graph.
#[derive(Debug, Clone)]
pub struct SceneNode {
    pub id: NodeId,
    pub kind: NodeKind,
    /// Position and size in world space (Y-down, origin at top-left).
    pub bounds: Rect,
    pub parent: Option<NodeId>,
    pub children: Vec<NodeId>,
}
