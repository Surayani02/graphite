use wasm_bindgen::prelude::*;

use crate::math::{color::Color, rect::Rect};
use crate::scene::node::{NodeId, NodeKind, SceneNode};

/// Flat-arena scene graph exposed to JavaScript via wasm-bindgen.
///
/// Nodes are stored at `nodes[id.0]`.  IDs are monotonically allocated
/// and never reused, making external references stable for the lifetime
/// of the graph.
#[wasm_bindgen]
pub struct SceneGraph {
    nodes: Vec<Option<SceneNode>>,
    roots: Vec<NodeId>,
    next_id: u32,
}

impl Default for SceneGraph {
    fn default() -> Self {
        Self::new()
    }
}

// ── Public WASM-exported API ──────────────────────────────────────────────────

#[wasm_bindgen]
impl SceneGraph {
    /// Creates an empty scene graph.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            nodes: Vec::new(),
            roots: Vec::new(),
            next_id: 0,
        }
    }

    /// Returns the total number of live nodes.
    pub fn node_count(&self) -> u32 {
        self.nodes.iter().filter(|n| n.is_some()).count() as u32
    }

    /// Adds a root-level frame (container; not rendered).
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
        self.roots.push(id);
        id.0
    }

    /// Adds a filled rectangle as a child of `parent`.
    ///
    /// Stroke defaults to transparent; corner radius defaults to 0.
    /// Use [`set_stroke`] and [`set_corner_radius`] to modify after creation.
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

    /// Adds a filled ellipse as a child of `parent`.
    ///
    /// When `w == h` the shape is a perfect circle.
    /// Stroke defaults to transparent; use [`set_stroke`] to add an outline.
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

    /// Applies a stroke colour and width to any Rect or Ellipse node.
    ///
    /// Pass `a: 0` to make the stroke invisible without removing it.
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

    /// Sets the corner radius of a Rect node in world units.
    /// Has no effect on Ellipse or Frame nodes.
    pub fn set_corner_radius(&mut self, id: u32, radius: f32) {
        let Some(Some(node)) = self.nodes.get_mut(id as usize) else {
            return;
        };
        if let NodeKind::Rect { corner_radius, .. } = &mut node.kind {
            *corner_radius = radius;
        }
    }

    /// Returns a flat `Float32Array` of every visible shape overlapping the
    /// current viewport, ready to upload directly into the GPU storage buffer.
    ///
    /// **Layout per shape — 16 × f32 = 64 bytes:**
    /// ```text
    /// [ x,  y,  w,  h,                               // world bounds
    ///   fill.r,   fill.g,   fill.b,   fill.a,        // fill  RGBA [0, 1]
    ///   stroke.r, stroke.g, stroke.b, stroke.a,      // stroke RGBA [0, 1]
    ///   stroke_width,  corner_radius,  shape_type,  _pad ]
    ///                                   └─ 0.0 = rect,  1.0 = ellipse
    /// ```
    ///
    /// Frame nodes are skipped — they are organisational containers only.
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
    }

    fn link_child(&mut self, parent_id: u32, child_id: NodeId) {
        if let Some(Some(p)) = self.nodes.get_mut(parent_id as usize) {
            p.children.push(child_id);
        }
    }

    /// Appends one shape's 16 floats to `out`.
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
        out.push(0.0); // padding — keeps the stride 64-byte aligned
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn wide_cam() -> (f32, f32, f32, f32, f32) {
        // cam_x, cam_y, zoom, vp_w, vp_h — sees everything near the origin
        (500.0, 400.0, 1.0, 1920.0, 1080.0)
    }

    // ── Construction ─────────────────────────────────────────────────────────

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
    fn frame_rect_ellipse_have_distinct_ids() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 1000.0);
        let rect = g.add_rect(f, 0.0, 0.0, 10.0, 10.0, 0, 0, 0, 255);
        let ellipse = g.add_ellipse(f, 0.0, 0.0, 10.0, 10.0, 0, 0, 0, 255);
        assert!(rect > f);
        assert!(ellipse > rect);
    }

    // ── Render list — stride and format ──────────────────────────────────────

    #[test]
    fn render_list_is_empty_for_frame_only_scene() {
        let mut g = SceneGraph::new();
        g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let (cx, cy, z, vw, vh) = wide_cam();
        assert!(g.get_render_list(cx, cy, z, vw, vh).is_empty());
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

    // ── Render list — position and colour ────────────────────────────────────

    #[test]
    fn render_list_encodes_position_and_size() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        g.add_rect(f, 100.0, 200.0, 300.0, 400.0, 0, 0, 0, 255);
        let (cx, cy, z, vw, vh) = wide_cam();
        let list = g.get_render_list(cx, cy, z, vw, vh);
        assert_eq!(list[0], 100.0); // x
        assert_eq!(list[1], 200.0); // y
        assert_eq!(list[2], 300.0); // w
        assert_eq!(list[3], 400.0); // h
    }

    #[test]
    fn render_list_normalises_fill_colour() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        g.add_rect(f, 0.0, 0.0, 50.0, 50.0, 255, 0, 128, 255);
        let (cx, cy, z, vw, vh) = wide_cam();
        let list = g.get_render_list(cx, cy, z, vw, vh);
        assert!((list[4] - 1.0).abs() < 1e-5); // r = 255/255
        assert_eq!(list[5], 0.0); // g = 0/255
        assert!((list[6] - 128.0 / 255.0).abs() < 1e-5); // b = 128/255
        assert!((list[7] - 1.0).abs() < 1e-5); // a = 255/255
    }

    #[test]
    fn render_list_normalises_ellipse_fill() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        g.add_ellipse(f, 0.0, 0.0, 80.0, 80.0, 0, 255, 0, 255);
        let (cx, cy, z, vw, vh) = wide_cam();
        let list = g.get_render_list(cx, cy, z, vw, vh);
        assert_eq!(list[4], 0.0); // r
        assert!((list[5] - 1.0).abs() < 1e-5); // g
        assert_eq!(list[6], 0.0); // b
        assert!((list[7] - 1.0).abs() < 1e-5); // a
    }

    // ── Render list — shape type ──────────────────────────────────────────────

    #[test]
    fn rect_has_shape_type_zero() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        g.add_rect(f, 0.0, 0.0, 100.0, 100.0, 255, 0, 0, 255);
        let (cx, cy, z, vw, vh) = wide_cam();
        let list = g.get_render_list(cx, cy, z, vw, vh);
        assert!(list[14].abs() < 1e-5); // shape_type = 0.0
    }

    #[test]
    fn ellipse_has_shape_type_one() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        g.add_ellipse(f, 0.0, 0.0, 100.0, 80.0, 0, 255, 0, 255);
        let (cx, cy, z, vw, vh) = wide_cam();
        let list = g.get_render_list(cx, cy, z, vw, vh);
        assert!((list[14] - 1.0).abs() < 1e-5); // shape_type = 1.0
    }

    // ── Render list — stroke ─────────────────────────────────────────────────

    #[test]
    fn new_rect_has_transparent_stroke() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        g.add_rect(f, 0.0, 0.0, 100.0, 100.0, 255, 0, 0, 255);
        let (cx, cy, z, vw, vh) = wide_cam();
        let list = g.get_render_list(cx, cy, z, vw, vh);
        assert_eq!(list[11], 0.0); // stroke alpha = 0
        assert_eq!(list[12], 0.0); // stroke_width = 0
    }

    #[test]
    fn set_stroke_on_rect_applies_colour_and_width() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let id = g.add_rect(f, 0.0, 0.0, 100.0, 100.0, 255, 0, 0, 255);
        g.set_stroke(id, 0, 0, 255, 255, 6.0);
        let (cx, cy, z, vw, vh) = wide_cam();
        let list = g.get_render_list(cx, cy, z, vw, vh);
        assert_eq!(list[8], 0.0); // stroke r
        assert_eq!(list[9], 0.0); // stroke g
        assert!((list[10] - 1.0).abs() < 1e-5); // stroke b
        assert!((list[11] - 1.0).abs() < 1e-5); // stroke a
        assert!((list[12] - 6.0).abs() < 1e-5); // stroke_width
    }

    #[test]
    fn set_stroke_on_ellipse_applies_colour_and_width() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let id = g.add_ellipse(f, 0.0, 0.0, 100.0, 100.0, 0, 0, 0, 0);
        g.set_stroke(id, 255, 128, 0, 255, 4.0);
        let (cx, cy, z, vw, vh) = wide_cam();
        let list = g.get_render_list(cx, cy, z, vw, vh);
        assert!((list[8] - 1.0).abs() < 1e-5); // r
        assert!((list[9] - 128.0 / 255.0).abs() < 1e-5); // g
        assert_eq!(list[10], 0.0); // b
        assert!((list[11] - 1.0).abs() < 1e-5); // a
        assert!((list[12] - 4.0).abs() < 1e-5); // width
    }

    // ── Render list — corner radius ───────────────────────────────────────────

    #[test]
    fn new_rect_has_zero_corner_radius() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        g.add_rect(f, 0.0, 0.0, 100.0, 100.0, 255, 0, 0, 255);
        let (cx, cy, z, vw, vh) = wide_cam();
        let list = g.get_render_list(cx, cy, z, vw, vh);
        assert_eq!(list[13], 0.0);
    }

    #[test]
    fn set_corner_radius_applies_to_rect() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let id = g.add_rect(f, 0.0, 0.0, 100.0, 100.0, 255, 0, 0, 255);
        g.set_corner_radius(id, 20.0);
        let (cx, cy, z, vw, vh) = wide_cam();
        let list = g.get_render_list(cx, cy, z, vw, vh);
        assert!((list[13] - 20.0).abs() < 1e-5);
    }

    #[test]
    fn set_corner_radius_has_no_effect_on_ellipse() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let id = g.add_ellipse(f, 0.0, 0.0, 100.0, 100.0, 0, 0, 0, 255);
        g.set_corner_radius(id, 20.0); // silently ignored
        let (cx, cy, z, vw, vh) = wide_cam();
        let list = g.get_render_list(cx, cy, z, vw, vh);
        // corner_radius at [13] remains 0.0 — ellipse SDF ignores it anyway
        assert_eq!(list[13], 0.0);
    }

    // ── Culling ───────────────────────────────────────────────────────────────

    #[test]
    fn render_list_culls_out_of_viewport_shapes() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 10_000.0, 10_000.0);
        g.add_rect(f, 9_000.0, 9_000.0, 100.0, 100.0, 255, 0, 0, 255);
        g.add_ellipse(f, 9_500.0, 9_500.0, 100.0, 100.0, 0, 255, 0, 255);
        // Tiny viewport centred at origin — both shapes are far away
        assert!(g.get_render_list(0.0, 0.0, 1.0, 100.0, 100.0).is_empty());
    }

    #[test]
    fn render_list_includes_only_visible_shapes() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 10_000.0, 10_000.0);
        for i in 0..5_u32 {
            g.add_rect(f, (i * 100) as f32, 0.0, 90.0, 90.0, 255, 0, 0, 255);
        }
        // One rect far outside the camera
        g.add_ellipse(f, 9_000.0, 9_000.0, 100.0, 100.0, 0, 255, 0, 255);
        let (cx, cy, z, vw, vh) = wide_cam();
        assert_eq!(g.get_render_list(cx, cy, z, vw, vh).len(), 5 * 16);
    }
}
