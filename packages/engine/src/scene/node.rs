use crate::math::{color::Color, rect::Rect};

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
