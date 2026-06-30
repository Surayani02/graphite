use wasm_bindgen::prelude::*;

use crate::math::{color::Color, rect::Rect};
use crate::scene::node::{NodeId, NodeKind, SceneNode};

/// Flat-arena scene graph exposed to JavaScript via wasm-bindgen.
///
/// `count` is maintained incrementally rather than computed by scanning
/// `nodes` on every call, since `node_count()` is part of the public API
/// and a future caller may reasonably call it once per frame.
///
/// Root-level recursive traversal (parent → children rendering order) is
/// deferred until a feature actually needs it — e.g. the Phase 6+ layers
/// panel, where re-parenting and explicit z-order become real operations.
/// Until then, z-order is simply arena insertion order, which is what
/// `get_render_list` and `hit_test` already use and what the existing test
/// suite (`hit_test_returns_topmost_shape_when_overlapping`) encodes as the
/// contract. A `roots` field previously existed here but was write-only —
/// populated by `add_frame`, never read — so it has been removed rather
/// than carried as dead weight that misleads future contributors into
/// thinking it drives traversal order.
#[wasm_bindgen]
pub struct SceneGraph {
    nodes: Vec<Option<SceneNode>>,
    next_id: u32,
    count: u32,
}

impl Default for SceneGraph {
    fn default() -> Self {
        Self::new()
    }
}

// ── Public WASM API ──────────────────────────────────────────────────────────

#[wasm_bindgen]
impl SceneGraph {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            nodes: Vec::new(),
            next_id: 0,
            count: 0,
        }
    }

    /// Returns the number of live nodes. O(1) — maintained incrementally.
    pub fn node_count(&self) -> u32 {
        self.count
    }

    pub fn add_frame(&mut self, x: f32, y: f32, w: f32, h: f32) -> u32 {
        let id = self.alloc_id();
        let node = SceneNode {
            id,
            kind: NodeKind::Frame,
            bounds: Rect { x, y, w, h },
            parent: None,
            children: Vec::new(),
        };
        self.store(node);
        id.0
    }

    #[allow(clippy::too_many_arguments)]
    pub fn add_rect(
        &mut self,
        parent: u32,
        x: f32,
        y: f32,
        w: f32,
        h: f32,
        r: u8,
        g: u8,
        b: u8,
        a: u8,
    ) -> u32 {
        let id = self.alloc_id();
        let node = SceneNode {
            id,
            kind: NodeKind::Rect {
                fill: Color { r, g, b, a },
                stroke: Color {
                    r: 0,
                    g: 0,
                    b: 0,
                    a: 0,
                },
                stroke_width: 0.0,
                corner_radius: 0.0,
            },
            bounds: Rect { x, y, w, h },
            parent: Some(NodeId(parent)),
            children: Vec::new(),
        };
        self.link_child(parent, id);
        self.store(node);
        id.0
    }

    #[allow(clippy::too_many_arguments)]
    pub fn add_ellipse(
        &mut self,
        parent: u32,
        x: f32,
        y: f32,
        w: f32,
        h: f32,
        r: u8,
        g: u8,
        b: u8,
        a: u8,
    ) -> u32 {
        let id = self.alloc_id();
        let node = SceneNode {
            id,
            kind: NodeKind::Ellipse {
                fill: Color { r, g, b, a },
                stroke: Color {
                    r: 0,
                    g: 0,
                    b: 0,
                    a: 0,
                },
                stroke_width: 0.0,
            },
            bounds: Rect { x, y, w, h },
            parent: Some(NodeId(parent)),
            children: Vec::new(),
        };
        self.link_child(parent, id);
        self.store(node);
        id.0
    }

    pub fn set_stroke(&mut self, id: u32, r: u8, g: u8, b: u8, a: u8, width: f32) {
        let Some(Some(node)) = self.nodes.get_mut(id as usize) else {
            return;
        };
        let color = Color { r, g, b, a };
        match &mut node.kind {
            NodeKind::Rect {
                stroke,
                stroke_width,
                ..
            } => {
                *stroke = color;
                *stroke_width = width;
            }
            NodeKind::Ellipse {
                stroke,
                stroke_width,
                ..
            } => {
                *stroke = color;
                *stroke_width = width;
            }
            NodeKind::Frame => {}
        }
    }

    pub fn set_corner_radius(&mut self, id: u32, radius: f32) {
        let Some(Some(node)) = self.nodes.get_mut(id as usize) else {
            return;
        };
        if let NodeKind::Rect { corner_radius, .. } = &mut node.kind {
            *corner_radius = radius;
        }
    }

    // ── Phase 4 additions ────────────────────────────────────────────────────

    /// Returns the id of the top-most renderable node hit at world `(x, y)`,
    /// or `None` if nothing is hit.
    ///
    /// Traverses in reverse insertion order so the visually topmost shape
    /// (drawn last) wins.  Frame nodes are never returned.
    ///
    /// Returns `Option<u32>` rather than a signed sentinel: `wasm-bindgen`
    /// maps this directly to `number | undefined` in TypeScript, so a miss
    /// is `undefined` instead of a magic `-1` that every call site has to
    /// remember to check for.
    pub fn hit_test(&self, x: f32, y: f32) -> Option<u32> {
        for slot in self.nodes.iter().rev() {
            let Some(node) = slot else { continue };
            match &node.kind {
                NodeKind::Frame => continue,
                NodeKind::Rect { .. } => {
                    if node.bounds.contains_point(x, y) {
                        return Some(node.id.0);
                    }
                }
                NodeKind::Ellipse { .. } => {
                    // Normalised point-in-ellipse: (Δx/rx)² + (Δy/ry)² ≤ 1
                    let cx = node.bounds.x + node.bounds.w * 0.5;
                    let cy = node.bounds.y + node.bounds.h * 0.5;
                    let rx = node.bounds.w * 0.5;
                    let ry = node.bounds.h * 0.5;
                    if rx > 0.0 && ry > 0.0 {
                        let ndx = (x - cx) / rx;
                        let ndy = (y - cy) / ry;
                        if ndx * ndx + ndy * ndy <= 1.0 {
                            return Some(node.id.0);
                        }
                    }
                }
            }
        }
        None
    }

    /// Moves a node to absolute world position `(x, y)`.
    ///
    /// Preferred for drag: compute `start_pos + delta` once per event,
    /// avoiding the floating-point drift of repeated delta accumulation.
    pub fn set_node_position(&mut self, id: u32, x: f32, y: f32) {
        let Some(Some(node)) = self.nodes.get_mut(id as usize) else {
            return;
        };
        node.bounds.x = x;
        node.bounds.y = y;
    }

    /// Returns `[x, y, w, h]` for the node, or an empty slice if the node
    /// does not exist.
    pub fn get_node_bounds(&self, id: u32) -> Vec<f32> {
        let Some(Some(node)) = self.nodes.get(id as usize) else {
            return Vec::new();
        };
        vec![node.bounds.x, node.bounds.y, node.bounds.w, node.bounds.h]
    }

    // ── Render list ──────────────────────────────────────────────────────────

    /// Returns a flat `Float32Array` (16 × f32 = 64 bytes per shape) of every
    /// visible shape that overlaps the viewport.
    pub fn get_render_list(
        &self,
        cam_x: f32,
        cam_y: f32,
        zoom: f32,
        vp_w: f32,
        vp_h: f32,
    ) -> Vec<f32> {
        let half_w = vp_w * 0.5 / zoom;
        let half_h = vp_h * 0.5 / zoom;
        let frustum = Rect {
            x: cam_x - half_w,
            y: cam_y - half_h,
            w: half_w * 2.0,
            h: half_h * 2.0,
        };

        let mut out = Vec::new();
        for slot in &self.nodes {
            let Some(node) = slot else { continue };
            if !node.bounds.intersects(&frustum) {
                continue;
            }
            match &node.kind {
                NodeKind::Frame => continue,
                NodeKind::Rect {
                    fill,
                    stroke,
                    stroke_width,
                    corner_radius,
                } => {
                    Self::push_shape(
                        &mut out,
                        node,
                        *fill,
                        *stroke,
                        *stroke_width,
                        *corner_radius,
                        0.0,
                    );
                }
                NodeKind::Ellipse {
                    fill,
                    stroke,
                    stroke_width,
                } => {
                    Self::push_shape(&mut out, node, *fill, *stroke, *stroke_width, 0.0, 1.0);
                }
            }
        }
        out
    }
}

// ── Private helpers ───────────────────────────────────────────────────────────

impl SceneGraph {
    fn alloc_id(&mut self) -> NodeId {
        let id = NodeId(self.next_id);
        self.next_id += 1;
        id
    }

    fn store(&mut self, node: SceneNode) {
        let idx = node.id.0 as usize;
        if idx >= self.nodes.len() {
            self.nodes.resize_with(idx + 1, || None);
        }
        self.nodes[idx] = Some(node);
        self.count += 1;
    }

    fn link_child(&mut self, parent_id: u32, child_id: NodeId) {
        if let Some(Some(p)) = self.nodes.get_mut(parent_id as usize) {
            p.children.push(child_id);
        }
    }

    fn push_shape(
        out: &mut Vec<f32>,
        node: &SceneNode,
        fill: Color,
        stroke: Color,
        stroke_width: f32,
        corner_radius: f32,
        shape_type: f32,
    ) {
        out.push(node.bounds.x);
        out.push(node.bounds.y);
        out.push(node.bounds.w);
        out.push(node.bounds.h);
        out.extend_from_slice(&fill.to_f32_array());
        out.extend_from_slice(&stroke.to_f32_array());
        out.push(stroke_width);
        out.push(corner_radius);
        out.push(shape_type);
        out.push(0.0); // pad
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn wide_cam() -> (f32, f32, f32, f32, f32) {
        (500.0, 400.0, 1.0, 1920.0, 1080.0)
    }

    // ── Phase 2/3 construction ───────────────────────────────────────────────

    #[test]
    fn new_graph_is_empty() {
        assert_eq!(SceneGraph::new().node_count(), 0);
    }

    #[test]
    fn add_frame_increments_count() {
        let mut g = SceneGraph::new();
        g.add_frame(0.0, 0.0, 1000.0, 800.0);
        assert_eq!(g.node_count(), 1);
    }

    #[test]
    fn add_rect_increments_count() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        g.add_rect(f, 0.0, 0.0, 100.0, 100.0, 255, 0, 0, 255);
        assert_eq!(g.node_count(), 2);
    }

    #[test]
    fn add_ellipse_increments_count() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        g.add_ellipse(f, 0.0, 0.0, 100.0, 100.0, 0, 255, 0, 255);
        assert_eq!(g.node_count(), 2);
    }

    #[test]
    fn ids_are_monotonically_increasing() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 1000.0);
        let rect = g.add_rect(f, 0.0, 0.0, 10.0, 10.0, 0, 0, 0, 255);
        let ellipse = g.add_ellipse(f, 0.0, 0.0, 10.0, 10.0, 0, 0, 0, 255);
        assert!(rect > f);
        assert!(ellipse > rect);
    }

    #[test]
    fn render_list_has_16_floats_per_shape() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        g.add_rect(f, 0.0, 0.0, 100.0, 100.0, 255, 0, 0, 255);
        let (cx, cy, z, vw, vh) = wide_cam();
        assert_eq!(g.get_render_list(cx, cy, z, vw, vh).len(), 16);
    }

    #[test]
    fn render_list_stride_is_16_per_shape() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        g.add_rect(f, 0.0, 0.0, 50.0, 50.0, 255, 0, 0, 255);
        g.add_ellipse(f, 60.0, 0.0, 50.0, 50.0, 0, 0, 255, 255);
        g.add_rect(f, 120.0, 0.0, 50.0, 50.0, 0, 255, 0, 255);
        let (cx, cy, z, vw, vh) = wide_cam();
        assert_eq!(g.get_render_list(cx, cy, z, vw, vh).len(), 3 * 16);
    }

    #[test]
    fn rect_has_shape_type_zero() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        g.add_rect(f, 0.0, 0.0, 100.0, 100.0, 255, 0, 0, 255);
        let (cx, cy, z, vw, vh) = wide_cam();
        assert!((g.get_render_list(cx, cy, z, vw, vh)[14]).abs() < 1e-5);
    }

    #[test]
    fn ellipse_has_shape_type_one() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        g.add_ellipse(f, 0.0, 0.0, 100.0, 80.0, 0, 255, 0, 255);
        let (cx, cy, z, vw, vh) = wide_cam();
        assert!((g.get_render_list(cx, cy, z, vw, vh)[14] - 1.0).abs() < 1e-5);
    }

    #[test]
    fn set_stroke_on_rect() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let id = g.add_rect(f, 0.0, 0.0, 100.0, 100.0, 255, 0, 0, 255);
        g.set_stroke(id, 0, 0, 255, 255, 6.0);
        let (cx, cy, z, vw, vh) = wide_cam();
        let list = g.get_render_list(cx, cy, z, vw, vh);
        assert!((list[12] - 6.0).abs() < 1e-5); // stroke_width
    }

    #[test]
    fn set_corner_radius_applies_to_rect() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let id = g.add_rect(f, 0.0, 0.0, 100.0, 100.0, 255, 0, 0, 255);
        g.set_corner_radius(id, 20.0);
        let (cx, cy, z, vw, vh) = wide_cam();
        assert!((g.get_render_list(cx, cy, z, vw, vh)[13] - 20.0).abs() < 1e-5);
    }

    #[test]
    fn render_list_culls_out_of_viewport_shapes() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 10_000.0, 10_000.0);
        g.add_rect(f, 9_000.0, 9_000.0, 100.0, 100.0, 255, 0, 0, 255);
        g.add_ellipse(f, 9_500.0, 9_500.0, 100.0, 100.0, 0, 255, 0, 255);
        assert!(g.get_render_list(0.0, 0.0, 1.0, 100.0, 100.0).is_empty());
    }

    // ── Phase 4: hit_test ────────────────────────────────────────────────────

    #[test]
    fn hit_test_returns_none_on_empty_scene() {
        let g = SceneGraph::new();
        assert_eq!(g.hit_test(50.0, 50.0), None);
    }

    #[test]
    fn hit_test_misses_when_clicking_outside_all_shapes() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        g.add_rect(f, 100.0, 100.0, 200.0, 150.0, 255, 0, 0, 255);
        assert_eq!(g.hit_test(50.0, 50.0), None);
    }

    #[test]
    fn hit_test_returns_rect_id_when_point_is_inside() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let rect = g.add_rect(f, 100.0, 100.0, 200.0, 150.0, 255, 0, 0, 255);
        assert_eq!(g.hit_test(150.0, 150.0), Some(rect));
    }

    #[test]
    fn hit_test_returns_ellipse_id_when_point_is_inside() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let ellipse_id = g.add_ellipse(f, 100.0, 100.0, 200.0, 200.0, 0, 255, 0, 255);
        // Centre of the ellipse → definitely inside
        assert_eq!(g.hit_test(200.0, 200.0), Some(ellipse_id));
    }

    #[test]
    fn hit_test_misses_ellipse_corner_outside_inscribed_circle() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        g.add_ellipse(f, 100.0, 100.0, 200.0, 200.0, 0, 255, 0, 255);
        // Top-left corner of the bounding box is outside the circle
        assert_eq!(g.hit_test(101.0, 101.0), None);
    }

    #[test]
    fn hit_test_never_returns_frame_id() {
        let mut g = SceneGraph::new();
        g.add_frame(0.0, 0.0, 1000.0, 800.0);
        // Clicking anywhere returns None because only a Frame exists
        assert_eq!(g.hit_test(100.0, 100.0), None);
    }

    #[test]
    fn hit_test_returns_topmost_shape_when_overlapping() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 1000.0);
        let _bottom = g.add_rect(f, 0.0, 0.0, 200.0, 200.0, 255, 0, 0, 255);
        let top = g.add_rect(f, 50.0, 50.0, 200.0, 200.0, 0, 0, 255, 255);
        // Point inside both rects — top (later inserted) should win
        assert_eq!(g.hit_test(100.0, 100.0), Some(top));
    }

    #[test]
    fn hit_test_bottom_shape_reachable_outside_top_shape() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 1000.0);
        let bottom = g.add_rect(f, 0.0, 0.0, 200.0, 200.0, 255, 0, 0, 255);
        let _top = g.add_rect(f, 100.0, 100.0, 200.0, 200.0, 0, 0, 255, 255);
        // Point inside bottom-only area
        assert_eq!(g.hit_test(10.0, 10.0), Some(bottom));
    }

    // ── Phase 4: set_node_position ───────────────────────────────────────────

    #[test]
    fn set_node_position_moves_rect() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let id = g.add_rect(f, 100.0, 100.0, 50.0, 50.0, 255, 0, 0, 255);
        g.set_node_position(id, 300.0, 400.0);
        let (cx, cy, z, vw, vh) = wide_cam();
        let list = g.get_render_list(cx, cy, z, vw, vh);
        assert_eq!(list[0], 300.0); // x
        assert_eq!(list[1], 400.0); // y
    }

    #[test]
    fn set_node_position_updates_hit_test() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let id = g.add_rect(f, 100.0, 100.0, 50.0, 50.0, 255, 0, 0, 255);
        // Originally at (100,100)...(150,150) — old position hits
        assert_eq!(g.hit_test(110.0, 110.0), Some(id));
        // Move to (300,300)
        g.set_node_position(id, 300.0, 300.0);
        // Old position should miss now
        assert_eq!(g.hit_test(110.0, 110.0), None);
        // New position should hit
        assert_eq!(g.hit_test(320.0, 320.0), Some(id));
    }

    #[test]
    fn set_node_position_on_nonexistent_id_is_no_op() {
        let mut g = SceneGraph::new();
        // Should not panic
        g.set_node_position(999, 0.0, 0.0);
        assert_eq!(g.node_count(), 0);
    }

    // ── Phase 4: get_node_bounds ─────────────────────────────────────────────

    #[test]
    fn get_node_bounds_returns_correct_values() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let id = g.add_rect(f, 10.0, 20.0, 300.0, 150.0, 0, 0, 0, 255);
        let b = g.get_node_bounds(id);
        assert_eq!(b.len(), 4);
        assert_eq!(b[0], 10.0);
        assert_eq!(b[1], 20.0);
        assert_eq!(b[2], 300.0);
        assert_eq!(b[3], 150.0);
    }

    #[test]
    fn get_node_bounds_returns_empty_for_missing_id() {
        let g = SceneGraph::new();
        assert!(g.get_node_bounds(999).is_empty());
    }

    #[test]
    fn get_node_bounds_reflects_set_node_position() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let id = g.add_rect(f, 0.0, 0.0, 100.0, 80.0, 0, 0, 0, 255);
        g.set_node_position(id, 42.0, 77.0);
        let b = g.get_node_bounds(id);
        assert_eq!(b[0], 42.0);
        assert_eq!(b[1], 77.0);
        assert_eq!(b[2], 100.0); // width unchanged
        assert_eq!(b[3], 80.0); // height unchanged
    }
}
