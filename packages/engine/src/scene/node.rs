use crate::math::{color::Color, rect::Rect};

/// Opaque, arena-stable node identifier.
///
/// The inner `u32` is the index into `SceneGraph::nodes`.
/// IDs are never reused within a single `SceneGraph` instance.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct NodeId(pub u32);

/// Semantic kind of a scene node.
#[derive(Debug, Clone)]
pub enum NodeKind {
    /// A transparent container.  Not rendered; used to group children.
    Frame,
    /// A filled axis-aligned rectangle.
    Rect { fill: Color },
}

/// One node in the scene graph.
#[derive(Debug, Clone)]
pub struct SceneNode {
    pub id:       NodeId,
    pub kind:     NodeKind,
    /// Position and size in world space.
    pub bounds:   Rect,
    pub parent:   Option<NodeId>,
    pub children: Vec<NodeId>,
}