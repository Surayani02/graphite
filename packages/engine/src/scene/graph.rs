use wasm_bindgen::prelude::*;

use crate::math::{color::Color, rect::Rect};
use crate::scene::node::{NodeId, NodeKind, SceneNode};

/// Flat-arena scene graph.
///
/// Nodes are stored at `nodes[id.0]`.  IDs are monotonically allocated and
/// never reused, which makes external references stable for the lifetime of
/// the graph.
///
/// Exposed to JavaScript via wasm-bindgen.  Only primitive types and
/// `Vec<f32>` cross the WASM boundary — no heap-allocated JS objects are
/// created in hot paths.
#[wasm_bindgen]
pub struct SceneGraph {
    /// Arena: `None` slots are logically deleted (not yet used in Phase 2).
    nodes:   Vec<Option<SceneNode>>,
    /// IDs of nodes without a parent, in insertion order.
    roots:   Vec<NodeId>,
    next_id: u32,
}

#[wasm_bindgen]
impl SceneGraph {
    /// Creates an empty scene graph.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            nodes:   Vec::new(),
            roots:   Vec::new(),
            next_id: 0,
        }
    }

    /// Returns the total number of live nodes (frames + rects).
    pub fn node_count(&self) -> u32 {
        self.nodes.iter().filter(|n| n.is_some()).count() as u32
    }

    /// Adds a root-level frame at the given world-space bounds.
    ///
    /// Returns the new node's `NodeId` as a `u32`.
    pub fn add_frame(&mut self, x: f32, y: f32, w: f32, h: f32) -> u32 {
        let id   = self.alloc_id();
        let node = SceneNode {
            id,
            kind:     NodeKind::Frame,
            bounds:   Rect { x, y, w, h },
            parent:   None,
            children: Vec::new(),
        };
        self.store(node);
        self.roots.push(id);
        id.0
    }

    /// Adds a filled rectangle as a child of `parent`.
    ///
    /// `r`, `g`, `b`, `a` are `u8` colour components in `[0, 255]`.
    /// Returns the new node's `NodeId` as a `u32`.
    pub fn add_rect(
        &mut self,
        parent: u32,
        x: f32, y: f32, w: f32, h: f32,
        r: u8, g: u8, b: u8, a: u8,
    ) -> u32 {
        let parent_id = NodeId(parent);
        let id        = self.alloc_id();

        let node = SceneNode {
            id,
            kind:     NodeKind::Rect { fill: Color { r, g, b, a } },
            bounds:   Rect { x, y, w, h },
            parent:   Some(parent_id),
            children: Vec::new(),
        };

        // Register child relationship
        if let Some(Some(p)) = self.nodes.get_mut(parent as usize) {
            p.children.push(id);
        }

        self.store(node);
        id.0
    }

    /// Returns a flat `Float32Array` describing every `Rect` node that
    /// overlaps the current viewport.
    ///
    /// Layout per rect (8 × f32 = 32 bytes):
    /// ```text
    /// [world_x, world_y, world_w, world_h, r, g, b, a]
    /// ```
    /// where `r`, `g`, `b`, `a` are normalised to `[0.0, 1.0]`.
    ///
    /// Frame nodes are skipped — they are organisational containers only.
    ///
    /// `cam_x`, `cam_y` — camera centre in world space.
    /// `zoom`           — world units per screen pixel.
    /// `vp_w`, `vp_h`  — viewport dimensions in physical pixels.
    pub fn get_render_list(
        &self,
        cam_x: f32,
        cam_y: f32,
        zoom:  f32,
        vp_w:  f32,
        vp_h:  f32,
    ) -> Vec<f32> {
        // Compute viewport frustum in world space
        let half_w  = vp_w * 0.5 / zoom;
        let half_h  = vp_h * 0.5 / zoom;
        let frustum = Rect {
            x: cam_x - half_w,
            y: cam_y - half_h,
            w: half_w * 2.0,
            h: half_h * 2.0,
        };

        let mut out = Vec::new();

        for slot in &self.nodes {
            let Some(node) = slot else { continue };
            let NodeKind::Rect { fill } = node.kind else { continue };

            // Frustum cull — skip rects entirely outside the viewport
            if !node.bounds.intersects(&frustum) {
                continue;
            }

            out.push(node.bounds.x);
            out.push(node.bounds.y);
            out.push(node.bounds.w);
            out.push(node.bounds.h);

            let rgba = fill.to_f32_array();
            out.extend_from_slice(&rgba);
        }

        out
    }

    // ─── Private helpers ──────────────────────────────────────────────────

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
}

// ─── Tests ───────────────────────────────────────────────────────────────────
//
// These run natively via `cargo test`.
// wasm-bindgen is a no-op on native targets, so #[wasm_bindgen] structs
// and methods are fully testable without a browser.

#[cfg(test)]
mod tests {
    use super::*;

    fn wide_viewport() -> (f32, f32, f32, f32, f32) {
        // cam_x, cam_y, zoom, vp_w, vp_h
        (500.0, 400.0, 1.0, 1920.0, 1080.0)
    }

    #[test]
    fn new_graph_is_empty() {
        let g = SceneGraph::new();
        assert_eq!(g.node_count(), 0);
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
        let frame = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        g.add_rect(frame, 10.0, 10.0, 100.0, 100.0, 255, 0, 0, 255);
        assert_eq!(g.node_count(), 2);
    }

    #[test]
    fn frame_and_rect_have_distinct_ids() {
        let mut g = SceneGraph::new();
        let frame = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let rect  = g.add_rect(frame, 0.0, 0.0, 50.0, 50.0, 0, 0, 255, 255);
        assert_ne!(frame, rect);
    }

    #[test]
    fn render_list_is_empty_for_frame_only_scene() {
        let mut g     = SceneGraph::new();
        g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let (cx, cy, zoom, vw, vh) = wide_viewport();
        assert!(g.get_render_list(cx, cy, zoom, vw, vh).is_empty());
    }

    #[test]
    fn render_list_returns_8_floats_per_rect() {
        let mut g     = SceneGraph::new();
        let frame     = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        g.add_rect(frame, 100.0, 100.0, 200.0, 150.0, 255, 128, 0, 255);
        let (cx, cy, zoom, vw, vh) = wide_viewport();
        let list = g.get_render_list(cx, cy, zoom, vw, vh);
        assert_eq!(list.len(), 8);
    }

    #[test]
    fn render_list_encodes_correct_position_and_size() {
        let mut g = SceneGraph::new();
        let frame = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        g.add_rect(frame, 100.0, 200.0, 300.0, 400.0, 0, 0, 0, 255);
        let (cx, cy, zoom, vw, vh) = wide_viewport();
        let list = g.get_render_list(cx, cy, zoom, vw, vh);
        assert_eq!(list[0], 100.0); // x
        assert_eq!(list[1], 200.0); // y
        assert_eq!(list[2], 300.0); // w
        assert_eq!(list[3], 400.0); // h
    }

    #[test]
    fn render_list_normalises_colour() {
        let mut g = SceneGraph::new();
        let frame = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        g.add_rect(frame, 0.0, 0.0, 50.0, 50.0, 255, 0, 128, 255);
        let (cx, cy, zoom, vw, vh) = wide_viewport();
        let list = g.get_render_list(cx, cy, zoom, vw, vh);
        assert!((list[4] - 1.0).abs() < 1e-5);  // r = 255/255
        assert_eq!(list[5], 0.0);                // g = 0/255
        assert!((list[6] - 128.0 / 255.0).abs() < 1e-5);
        assert!((list[7] - 1.0).abs() < 1e-5);  // a = 255/255
    }

    #[test]
    fn render_list_culls_out_of_viewport_rect() {
        let mut g = SceneGraph::new();
        let frame = g.add_frame(0.0, 0.0, 10_000.0, 10_000.0);
        // Rect far from the camera
        g.add_rect(frame, 9_000.0, 9_000.0, 100.0, 100.0, 255, 0, 0, 255);
        // Small viewport centred at origin — rect is far outside it
        let list = g.get_render_list(0.0, 0.0, 1.0, 100.0, 100.0);
        assert!(list.is_empty());
    }

    #[test]
    fn render_list_includes_multiple_visible_rects() {
        let mut g = SceneGraph::new();
        let frame = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        for i in 0..5_u32 {
            g.add_rect(frame, (i * 100) as f32, 0.0, 90.0, 90.0, 255, 0, 0, 255);
        }
        let (cx, cy, zoom, vw, vh) = wide_viewport();
        let list = g.get_render_list(cx, cy, zoom, vw, vh);
        assert_eq!(list.len(), 5 * 8);
    }

    #[test]
    fn ids_are_monotonically_increasing() {
        let mut g = SceneGraph::new();
        let f0 = g.add_frame(0.0, 0.0, 100.0, 100.0);
        let r0 = g.add_rect(f0, 0.0, 0.0, 10.0, 10.0, 0, 0, 0, 255);
        let r1 = g.add_rect(f0, 0.0, 0.0, 10.0, 10.0, 0, 0, 0, 255);
        assert!(r0 > f0);
        assert!(r1 > r0);
    }
}