use wasm_bindgen::prelude::*;

use crate::math::{color::Color, rect::Rect};
use crate::scene::mesh_store::{MeshStore, INVALID_HANDLE};
use crate::scene::node::{NodeId, NodeKind, SceneNode};
use graphite_geometry::{
    bounds as geometry_bounds, tessellate_fill, tessellate_stroke, Contour, FillRule, LineCap,
    LineJoin, PathGeometry, PathPoint, StrokeStyle,
};

/// Flat-arena scene graph exposed to JavaScript via wasm-bindgen.
///
/// `count` is maintained incrementally rather than computed by scanning
/// `nodes` on every call, since `node_count()` is part of the public API
/// and a future caller may reasonably call it once per frame.
///
/// Root-level recursive traversal (parent → children rendering order) is
/// still deferred until a feature needs the *hierarchy* — but z-order
/// stopped being implicit in Phase 7 M3: `order` below is the explicit
/// paint order (back-to-front), and `get_render_list` / `hit_test`
/// traverse it rather than the arena. The trigger was undo-of-delete: a
/// restored node must reappear at its exact original stacking position,
/// which an append-only arena cannot express — the alternative was a full
/// scene rebuild on every such op (the Phase 7 M1 stopgap this replaces).
/// The existing topmost-wins contract
/// (`hit_test_returns_topmost_shape_when_overlapping`) is unchanged:
/// insertion still appends to the top; `move_node_to_index` is the only
/// way order diverges from insertion sequence. A `roots` field previously existed here but was write-only —
/// populated by `add_frame`, never read — so it has been removed rather
/// than carried as dead weight that misleads future contributors into
/// thinking it drives traversal order. `children` (on `SceneNode`, below)
/// was in the same write-only state until Phase 6 M3's `remove_node`
/// started reading and maintaining it (leaf-only removal needs to check
/// "does this node have children", and keeping a removed node's id out of
/// its former parent's list) — it stays, now genuinely earning its keep.
#[wasm_bindgen]
pub struct SceneGraph {
    nodes: Vec<Option<SceneNode>>,
    /// Paint order, back-to-front, holding only live ids (`remove_node`
    /// splices; `store` appends). The arena stays index-addressed and ids
    /// are still never reused (ADR-008) — this vec is the single traversal
    /// authority layered on top.
    order: Vec<NodeId>,
    next_id: u32,
    count: u32,
    /// Tessellated meshes the host currently holds handles for
    /// (ADR-032 §3). Lives on the graph rather than beside it so one
    /// wasm-bindgen object owns the whole boundary.
    meshes: MeshStore,
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
            order: Vec::new(),
            next_id: 0,
            count: 0,
            meshes: MeshStore::new(),
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
            NodeKind::Path {
                stroke: path_stroke,
                stroke_style,
                geometry_version,
                ..
            } => {
                *path_stroke = color;
                stroke_style.width = width;
                // The stroke mesh is a function of width — invalidate.
                *geometry_version = geometry_version.saturating_add(1);
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

    // ── Phase 6 Milestone 2 additions ────────────────────────────────────────

    /// Sets a node's fill colour. Mirrors `set_stroke`: matches on node
    /// kind, silent no-op for `Frame` (no fill concept) or a missing id.
    pub fn set_fill(&mut self, id: u32, r: u8, g: u8, b: u8, a: u8) {
        let Some(Some(node)) = self.nodes.get_mut(id as usize) else {
            return;
        };
        let color = Color { r, g, b, a };
        match &mut node.kind {
            NodeKind::Rect { fill, .. } => *fill = color,
            NodeKind::Ellipse { fill, .. } => *fill = color,
            // Fill colour rides the per-draw uniform, not the mesh, so
            // this deliberately does not bump geometry_version.
            NodeKind::Path { fill, .. } => *fill = color,
            NodeKind::Frame => {}
        }
    }

    /// Resizes a node in place (top-left `x`/`y` unchanged). Mirrors
    /// `set_node_position`: direct bounds mutation, silent no-op on a
    /// missing id.
    pub fn set_size(&mut self, id: u32, w: f32, h: f32) {
        let Some(Some(node)) = self.nodes.get_mut(id as usize) else {
            return;
        };
        node.bounds.w = w;
        node.bounds.h = h;
    }

    // ── Phase 6 Milestone 3 additions ────────────────────────────────────────

    /// Removes a node, tombstoning its arena slot (ADR-008: ids are never
    /// reused, so this never invalidates a *different* still-live id).
    ///
    /// Refuses (returns `false`, no mutation) if the id doesn't exist, is
    /// already removed, or — the deliberate M3 scope limit — still has
    /// children: cascading a frame's contents is a data-loss operation this
    /// milestone has no undo system to protect, so it is simply not offered
    /// yet (the TypeScript `DocumentModel.removeNode` enforces the same
    /// leaf-only rule; this mirrors it so a caller that skipped the
    /// document-model check for some reason still can't corrupt the graph).
    ///
    /// On success, also removes the id from its parent's `children` — a
    /// dangling child reference would sit inertly today (nothing reads
    /// `children` yet, see the struct doc comment) but would silently
    /// corrupt whatever future traversal feature starts reading it, which
    /// is exactly the class of bug `document/validate.ts` exists to catch
    /// on the TypeScript side. `node_count()` decrements; frame-count
    /// bookkeeping needs no change since only leaves are removable here.
    pub fn remove_node(&mut self, id: u32) -> bool {
        let Some(Some(node)) = self.nodes.get(id as usize) else {
            return false;
        };
        if !node.children.is_empty() {
            return false;
        }
        let parent = node.parent;

        self.nodes[id as usize] = None;
        self.order.retain(|&n| n != NodeId(id));
        self.count -= 1;

        if let Some(parent_id) = parent {
            self.unlink_child(parent_id.0, NodeId(id));
        }
        true
    }

    // ── Phase 7 Milestone 3 additions ────────────────────────────────────────

    /// Moves a node to `index` in the paint order (0 = back-most; indices
    /// past the top clamp to top-most). Silent no-op for a missing or
    /// removed id, matching the `set_*` family's contract.
    ///
    /// This is the order-exact half of the M3 create path: the worker
    /// appends via `add_*` (which lands on top) and then splices the node
    /// to the document's `orderIndex` — so an undone delete reappears at
    /// its exact original stacking position without the full scene rebuild
    /// that Phase 7 M1 used as a stopgap. O(n) splice, single-digit
    /// microseconds at the 10k MVP scale (`move_node_to_index_10k` bench),
    /// and it runs once per structural edit — never per frame.
    pub fn move_node_to_index(&mut self, id: u32, index: u32) {
        let Some(pos) = self.order.iter().position(|&n| n == NodeId(id)) else {
            return;
        };
        let node_id = self.order.remove(pos);
        let target = (index as usize).min(self.order.len());
        self.order.insert(target, node_id);
    }

    // ── Phase 4 additions ────────────────────────────────────────────────────

    /// Returns the id of the top-most renderable node hit at world `(x, y)`,
    /// or `None` if nothing is hit.
    ///
    /// Traverses the paint order in reverse so the visually topmost shape
    /// (drawn last) wins.  Frame nodes are never returned.
    ///
    /// Returns `Option<u32>` rather than a signed sentinel: `wasm-bindgen`
    /// maps this directly to `number | undefined` in TypeScript, so a miss
    /// is `undefined` instead of a magic `-1` that every call site has to
    /// remember to check for.
    pub fn hit_test(&self, x: f32, y: f32) -> Option<u32> {
        for node_id in self.order.iter().rev() {
            // `order` never holds dead ids (remove_node splices them out);
            // the double-Option guard is belt-and-braces on the arena
            // lookup, in the codebase's silent-tolerance style.
            let Some(Some(node)) = self.nodes.get(node_id.0 as usize) else {
                continue;
            };
            match &node.kind {
                NodeKind::Frame => continue,
                NodeKind::Rect { .. } => {
                    if node.bounds.contains_point(x, y) {
                        return Some(node.id.0);
                    }
                }
                // Control-polygon bounds, not the filled region: exact
                // path hit-testing arrives with the path *model* in M2,
                // which is also when a tool can first select one. M1 has
                // no document path nodes — fixtures live below the
                // document layer — so a conservative bounds hit is the
                // honest placeholder rather than a silent `continue`.
                NodeKind::Path { .. } => {
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
        let dx = x - node.bounds.x;
        let dy = y - node.bounds.y;
        node.bounds.x = x;
        node.bounds.y = y;
        // Path geometry is node-local (ADR-032 §7): a move shifts the
        // draw translate and leaves every cached mesh valid.
        if let NodeKind::Path {
            origin_x, origin_y, ..
        } = &mut node.kind
        {
            *origin_x += dx;
            *origin_y += dy;
        }
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
    /// Adds a vector path node (Phase 8 M1 — ADR-031/032).
    ///
    /// Flat boundary encoding, because wasm-bindgen carries typed arrays
    /// and not nested structures: `contour_descs` is `[point_count,
    /// closed]` pairs and `points` is 6 f32 per point in `PathPoint`
    /// field order (anchor x/y, in-handle x/y, out-handle x/y), contours
    /// laid end to end. `fill_rule` is 0 = non-zero, 1 = even-odd;
    /// `cap` is 0 = butt, 1 = round, 2 = square; `join` is 0 = miter,
    /// 1 = round, 2 = bevel.
    ///
    /// `x`/`y` place the geometry's **local** frame in world space
    /// (ADR-032 §7). Returns the new node id, or `u32::MAX` if the
    /// encoding is malformed or the geometry has no bounds — a
    /// classification, never a panic, matching the tessellators.
    #[allow(clippy::too_many_arguments)]
    pub fn add_path(
        &mut self,
        parent: u32,
        x: f32,
        y: f32,
        contour_descs: &[u32],
        points: &[f32],
        fill_rule: u8,
        fill_r: u8,
        fill_g: u8,
        fill_b: u8,
        fill_a: u8,
        stroke_r: u8,
        stroke_g: u8,
        stroke_b: u8,
        stroke_a: u8,
        stroke_width: f32,
        cap: u8,
        join: u8,
        miter_limit: f32,
    ) -> u32 {
        let Some(geometry) = decode_geometry(contour_descs, points, fill_rule) else {
            return INVALID_HANDLE;
        };
        let Some(local) = geometry_bounds(&geometry) else {
            return INVALID_HANDLE;
        };

        let id = self.alloc_id();
        // f32 carries integers exactly below 2^24, and the render record
        // ships the id and the version as floats (§B.2). 2^24 is five
        // orders of magnitude above SYSTEM_MAX_OBJECTS, so this is a
        // debug assertion rather than a runtime branch.
        debug_assert!(id.0 < (1 << 24), "node id must stay f32-exact");

        let node = SceneNode {
            id,
            kind: NodeKind::Path {
                geometry,
                fill: Color {
                    r: fill_r,
                    g: fill_g,
                    b: fill_b,
                    a: fill_a,
                },
                stroke: Color {
                    r: stroke_r,
                    g: stroke_g,
                    b: stroke_b,
                    a: stroke_a,
                },
                stroke_style: StrokeStyle {
                    width: stroke_width,
                    cap: decode_cap(cap),
                    join: decode_join(join),
                    miter_limit,
                },
                origin_x: x,
                origin_y: y,
                geometry_version: 1,
            },
            // World control-polygon bounds. Stroke inflation is
            // deliberately excluded, matching every other kind here:
            // `add_rect` does not widen bounds for its stroke either, so
            // paths inherit the existing (documented, uniform) culling
            // convention rather than inventing a second one.
            bounds: Rect {
                x: x + local[0],
                y: y + local[1],
                w: local[2],
                h: local[3],
            },
            parent: Some(NodeId(parent)),
            children: Vec::new(),
        };
        self.link_child(parent, id);
        self.store(node);
        id.0
    }

    /// Mesh-invalidation counter for a path node: 1 on creation, bumped
    /// by every geometry- or stroke-affecting edit. Returns 0 for any
    /// other kind or a missing id, so `0` reads as "not a path".
    pub fn geometry_version(&self, id: u32) -> u32 {
        match self.nodes.get(id as usize) {
            Some(Some(node)) => match &node.kind {
                NodeKind::Path {
                    geometry_version, ..
                } => *geometry_version,
                _ => 0,
            },
            _ => 0,
        }
    }

    /// Tessellates one part of a path node and returns a mesh handle
    /// (ADR-032 §3). `part` is 0 = fill, 1 = stroke. Returns
    /// `u32::MAX` when the node is missing, is not a path, the part code
    /// is unknown, or the geometry is degenerate under this request —
    /// the caller skips the draw.
    ///
    /// `tolerance` is in the path's local units; the host derives it
    /// from the zoom bucket (ADR-032 §4).
    pub fn tessellate_path(&mut self, id: u32, part: u8, tolerance: f32) -> u32 {
        let mesh = {
            let Some(Some(node)) = self.nodes.get(id as usize) else {
                return INVALID_HANDLE;
            };
            let NodeKind::Path {
                geometry,
                stroke_style,
                ..
            } = &node.kind
            else {
                return INVALID_HANDLE;
            };
            match part {
                0 => tessellate_fill(geometry, tolerance),
                1 => tessellate_stroke(geometry, stroke_style, tolerance),
                _ => return INVALID_HANDLE,
            }
        };
        match mesh {
            Ok(mesh) => self.meshes.insert(mesh),
            Err(_) => INVALID_HANDLE,
        }
    }

    /// xy-interleaved positions for a mesh handle, in the path's local
    /// frame. Empty when the handle is unknown or already freed.
    pub fn mesh_positions(&self, handle: u32) -> Vec<f32> {
        self.meshes
            .get(handle)
            .map(|mesh| mesh.positions.clone())
            .unwrap_or_default()
    }

    /// Triangle-list indices for a mesh handle. Empty when the handle is
    /// unknown or already freed.
    pub fn mesh_indices(&self, handle: u32) -> Vec<u32> {
        self.meshes
            .get(handle)
            .map(|mesh| mesh.indices.clone())
            .unwrap_or_default()
    }

    /// Releases a mesh handle. Unknown and repeated handles are ignored,
    /// in the arena's existing silent-tolerance style.
    pub fn mesh_free(&mut self, handle: u32) {
        self.meshes.free(handle);
    }

    /// Number of tessellated meshes the host still holds. Diagnostic:
    /// a value that grows across idle frames is a host-side leak.
    pub fn mesh_count(&self) -> u32 {
        self.meshes.len() as u32
    }

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
        for node_id in &self.order {
            let Some(Some(node)) = self.nodes.get(node_id.0 as usize) else {
                continue;
            };
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
                NodeKind::Path {
                    fill,
                    stroke,
                    stroke_style,
                    origin_x,
                    origin_y,
                    geometry_version,
                    ..
                } => {
                    Self::push_path(
                        &mut out,
                        node,
                        *fill,
                        *stroke,
                        stroke_style.width,
                        (*origin_x, *origin_y),
                        *geometry_version,
                    );
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
        self.order.push(node.id);
        self.nodes[idx] = Some(node);
        self.count += 1;
    }

    fn link_child(&mut self, parent_id: u32, child_id: NodeId) {
        if let Some(Some(p)) = self.nodes.get_mut(parent_id as usize) {
            p.children.push(child_id);
        }
    }

    fn unlink_child(&mut self, parent_id: u32, child_id: NodeId) {
        if let Some(Some(p)) = self.nodes.get_mut(parent_id as usize) {
            p.children.retain(|&c| c != child_id);
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

    /// Path-reference record (ADR-032 §1). Same 16-float stride as
    /// [`Self::push_shape`], so SDF records are byte-identical to before
    /// and the host's storage buffer is unchanged; `shape_type` 2 tells
    /// the draw planner to emit a mesh draw instead of an SDF instance.
    ///
    /// Slot use, and where it diverges from the SDF layout:
    /// - `0,1` — the node **origin** (the draw translate), not the
    ///   bounds minimum. The host needs the local frame's world position
    ///   for the per-draw uniform, and culling already happened here, so
    ///   spending these two slots on the translate saves a second
    ///   crossing. ADR-032 §1 sketched the record as carrying bounds;
    ///   this is the implementation's correction, and the recorded
    ///   reason for it.
    /// - `2,3` — world bounds size, for debug overlays.
    /// - `4..7` fill, `8..11` stroke, `12` stroke width — as SDF.
    /// - `13` — the engine node id (SDF: corner radius, meaningless here).
    /// - `14` — shape type, 2.
    /// - `15` — geometry version (SDF: pad).
    ///
    /// The id and version are f32-exact below 2^24; `add_path`
    /// debug-asserts the id and the version would need 16.7 M edits to
    /// one node to reach it.
    fn push_path(
        out: &mut Vec<f32>,
        node: &SceneNode,
        fill: Color,
        stroke: Color,
        stroke_width: f32,
        origin: (f32, f32),
        geometry_version: u32,
    ) {
        out.push(origin.0);
        out.push(origin.1);
        out.push(node.bounds.w);
        out.push(node.bounds.h);
        out.extend_from_slice(&fill.to_f32_array());
        out.extend_from_slice(&stroke.to_f32_array());
        out.push(stroke_width);
        out.push(node.id.0 as f32);
        out.push(2.0);
        out.push(geometry_version as f32);
    }
}

// ── Flat-encoding decoders ────────────────────────────────────────────────────

/// Rebuilds a [`PathGeometry`] from the flat wasm-bindgen encoding.
/// Returns `None` when the description and payload disagree — a wrong
/// length, a contour shorter than two points, or trailing bytes — so a
/// malformed host call is rejected rather than silently truncated.
fn decode_geometry(contour_descs: &[u32], points: &[f32], fill_rule: u8) -> Option<PathGeometry> {
    if contour_descs.is_empty() || !contour_descs.len().is_multiple_of(2) {
        return None;
    }
    let mut contours = Vec::with_capacity(contour_descs.len() / 2);
    let mut cursor = 0usize;
    for desc in contour_descs.chunks_exact(2) {
        let count = desc[0] as usize;
        if count < 2 {
            return None;
        }
        let end = cursor.checked_add(count.checked_mul(6)?)?;
        if end > points.len() {
            return None;
        }
        let mut pts = Vec::with_capacity(count);
        for p in points[cursor..end].chunks_exact(6) {
            pts.push(PathPoint {
                x: p[0],
                y: p[1],
                h_in_x: p[2],
                h_in_y: p[3],
                h_out_x: p[4],
                h_out_y: p[5],
            });
        }
        contours.push(Contour {
            closed: desc[1] != 0,
            points: pts,
        });
        cursor = end;
    }
    if cursor != points.len() {
        return None;
    }
    Some(PathGeometry {
        contours,
        fill_rule: if fill_rule == 1 {
            FillRule::EvenOdd
        } else {
            FillRule::NonZero
        },
    })
}

/// Unknown codes fall back to the CSS/SVG initial value rather than
/// failing the whole call: a cap code is cosmetic, and rejecting a path
/// over one would be a worse failure mode than drawing a butt cap.
fn decode_cap(code: u8) -> LineCap {
    match code {
        1 => LineCap::Round,
        2 => LineCap::Square,
        _ => LineCap::Butt,
    }
}

/// Unknown codes fall back to miter, the CSS/SVG initial value — see
/// [`decode_cap`].
fn decode_join(code: u8) -> LineJoin {
    match code {
        1 => LineJoin::Round,
        2 => LineJoin::Bevel,
        _ => LineJoin::Miter,
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Path nodes (Phase 8 M1) ──────────────────────────────────────────────

    /// Encodes one closed triangle at the given local offset: the flat
    /// (`contour_descs`, `points`) pair `add_path` expects.
    fn triangle_encoding() -> (Vec<u32>, Vec<f32>) {
        let corners = [(0.0f32, 0.0f32), (120.0, 0.0), (0.0, 90.0)];
        let mut points = Vec::with_capacity(18);
        for (x, y) in corners {
            points.extend_from_slice(&[x, y, x, y, x, y]);
        }
        (vec![3, 1], points)
    }

    fn add_triangle(g: &mut SceneGraph, x: f32, y: f32) -> u32 {
        let frame = g.add_frame(0.0, 0.0, 10_000.0, 10_000.0);
        let (descs, points) = triangle_encoding();
        g.add_path(
            frame, x, y, &descs, &points, 0, 10, 20, 30, 255, 0, 0, 0, 0, 0.0, 0, 0, 4.0,
        )
    }

    #[test]
    fn add_path_stores_world_bounds_and_starts_at_version_one() {
        let mut g = SceneGraph::new();
        let id = add_triangle(&mut g, 50.0, 70.0);
        assert_ne!(id, INVALID_HANDLE);
        assert_eq!(g.get_node_bounds(id), vec![50.0, 70.0, 120.0, 90.0]);
        assert_eq!(g.geometry_version(id), 1);
    }

    #[test]
    fn geometry_version_is_zero_for_non_paths_and_missing_ids() {
        let mut g = SceneGraph::new();
        let frame = g.add_frame(0.0, 0.0, 100.0, 100.0);
        let rect = g.add_rect(frame, 0.0, 0.0, 10.0, 10.0, 1, 2, 3, 4);
        assert_eq!(g.geometry_version(rect), 0);
        assert_eq!(g.geometry_version(frame), 0);
        assert_eq!(g.geometry_version(9_999), 0);
    }

    #[test]
    fn add_path_rejects_malformed_encodings() {
        let mut g = SceneGraph::new();
        let frame = g.add_frame(0.0, 0.0, 100.0, 100.0);
        let (_descs, points) = triangle_encoding();
        let bad: [(&[u32], &[f32]); 5] = [
            (&[], &points),           // no contours
            (&[3], &points),          // odd desc length
            (&[1, 1], &points[..6]),  // contour shorter than two points
            (&[3, 1], &points[..12]), // payload too short
            (&[2, 1], &points),       // payload longer than described
        ];
        for (d, pts) in bad {
            let id = g.add_path(
                frame, 0.0, 0.0, d, pts, 0, 1, 2, 3, 4, 0, 0, 0, 0, 0.0, 0, 0, 4.0,
            );
            assert_eq!(id, INVALID_HANDLE, "descs {d:?} / {} floats", pts.len());
        }
        assert_eq!(g.node_count(), 1, "no partial node may be stored");
    }

    #[test]
    fn moving_a_path_shifts_its_origin_and_leaves_geometry_untouched() {
        let mut g = SceneGraph::new();
        let id = add_triangle(&mut g, 50.0, 70.0);
        let before = g.geometry_version(id);
        g.set_node_position(id, 250.0, 170.0);

        assert_eq!(g.get_node_bounds(id), vec![250.0, 170.0, 120.0, 90.0]);
        assert_eq!(
            g.geometry_version(id),
            before,
            "a move must not invalidate cached meshes (ADR-032 §7)"
        );
        let list = g.get_render_list(300.0, 200.0, 1.0, 1920.0, 1080.0);
        assert_eq!(
            (list[0], list[1]),
            (250.0, 170.0),
            "record carries the translate"
        );
    }

    #[test]
    fn stroke_changes_bump_the_version_but_fill_changes_do_not() {
        let mut g = SceneGraph::new();
        let id = add_triangle(&mut g, 0.0, 0.0);
        g.set_fill(id, 9, 9, 9, 255);
        assert_eq!(g.geometry_version(id), 1, "fill rides the uniform");
        g.set_stroke(id, 1, 2, 3, 255, 6.0);
        assert_eq!(g.geometry_version(id), 2, "stroke width reshapes the mesh");
    }

    #[test]
    fn render_list_path_record_layout() {
        let mut g = SceneGraph::new();
        let id = add_triangle(&mut g, 50.0, 70.0);
        let list = g.get_render_list(100.0, 100.0, 1.0, 1920.0, 1080.0);
        assert_eq!(list.len(), 16, "one path record, one 16-float stride");
        assert_eq!(&list[0..4], &[50.0, 70.0, 120.0, 90.0]);
        assert_eq!(list[4], 10.0 / 255.0, "fill r");
        assert_eq!(list[13], id as f32, "engine id");
        assert_eq!(list[14], 2.0, "shape_type 2 = path reference");
        assert_eq!(list[15], 1.0, "geometry version");
    }

    #[test]
    fn sdf_records_are_unchanged_by_the_path_variant() {
        let mut g = SceneGraph::new();
        let frame = g.add_frame(0.0, 0.0, 10_000.0, 10_000.0);
        let rect = g.add_rect(frame, 10.0, 20.0, 30.0, 40.0, 1, 2, 3, 255);
        g.set_corner_radius(rect, 5.0);
        let list = g.get_render_list(0.0, 0.0, 1.0, 1920.0, 1080.0);
        assert_eq!(&list[0..4], &[10.0, 20.0, 30.0, 40.0]);
        assert_eq!(list[13], 5.0, "slot 13 is still corner radius for SDF");
        assert_eq!(list[14], 0.0);
        assert_eq!(list[15], 0.0, "slot 15 is still pad for SDF");
    }

    #[test]
    fn paths_keep_paint_order_between_sdf_shapes() {
        let mut g = SceneGraph::new();
        let frame = g.add_frame(0.0, 0.0, 10_000.0, 10_000.0);
        let (descs, points) = triangle_encoding();
        g.add_rect(frame, 0.0, 0.0, 50.0, 50.0, 1, 1, 1, 255);
        g.add_path(
            frame, 0.0, 0.0, &descs, &points, 0, 2, 2, 2, 255, 0, 0, 0, 0, 0.0, 0, 0, 4.0,
        );
        g.add_rect(frame, 0.0, 0.0, 50.0, 50.0, 3, 3, 3, 255);

        let list = g.get_render_list(0.0, 0.0, 1.0, 1920.0, 1080.0);
        let kinds: Vec<f32> = list.chunks_exact(16).map(|r| r[14]).collect();
        assert_eq!(
            kinds,
            vec![0.0, 2.0, 0.0],
            "interleaving follows paint order"
        );
    }

    #[test]
    fn tessellate_path_round_trips_through_a_handle() {
        let mut g = SceneGraph::new();
        let id = add_triangle(&mut g, 0.0, 0.0);

        let fill = g.tessellate_path(id, 0, 0.25);
        assert_ne!(fill, INVALID_HANDLE);
        let positions = g.mesh_positions(fill);
        let indices = g.mesh_indices(fill);
        assert_eq!(positions.len(), 6, "a triangle tessellates to 3 vertices");
        assert_eq!(indices.len(), 3);
        assert_eq!(g.mesh_count(), 1);

        g.mesh_free(fill);
        assert_eq!(g.mesh_count(), 0);
        assert!(
            g.mesh_positions(fill).is_empty(),
            "freed handle reads empty"
        );
        assert!(g.mesh_indices(fill).is_empty());
    }

    #[test]
    fn tessellate_path_rejects_bad_requests_without_leaking() {
        let mut g = SceneGraph::new();
        let id = add_triangle(&mut g, 0.0, 0.0);
        let frame_id = 0u32;
        assert_eq!(
            g.tessellate_path(id, 7, 0.25),
            INVALID_HANDLE,
            "unknown part"
        );
        assert_eq!(
            g.tessellate_path(id, 0, 0.0),
            INVALID_HANDLE,
            "bad tolerance"
        );
        assert_eq!(
            g.tessellate_path(frame_id, 0, 0.25),
            INVALID_HANDLE,
            "not a path"
        );
        assert_eq!(
            g.tessellate_path(9_999, 0, 0.25),
            INVALID_HANDLE,
            "missing id"
        );
        // The zero-width stroke of this fixture has no ink.
        assert_eq!(
            g.tessellate_path(id, 1, 0.25),
            INVALID_HANDLE,
            "degenerate stroke"
        );
        assert_eq!(g.mesh_count(), 0, "no failed request may retain a mesh");
    }

    #[test]
    fn stroke_tessellates_once_a_width_is_set() {
        let mut g = SceneGraph::new();
        let id = add_triangle(&mut g, 0.0, 0.0);
        g.set_stroke(id, 0, 0, 0, 255, 4.0);
        let handle = g.tessellate_path(id, 1, 0.25);
        assert_ne!(handle, INVALID_HANDLE);
        assert!(!g.mesh_indices(handle).is_empty());
        g.mesh_free(handle);
    }

    #[test]
    fn removing_a_path_node_keeps_the_scene_consistent() {
        let mut g = SceneGraph::new();
        let id = add_triangle(&mut g, 0.0, 0.0);
        assert_eq!(g.node_count(), 2);
        assert!(g.remove_node(id));
        assert_eq!(g.node_count(), 1);
        assert!(g.get_render_list(0.0, 0.0, 1.0, 1920.0, 1080.0).is_empty());
        assert_eq!(g.geometry_version(id), 0);
    }

    #[test]
    fn culled_paths_emit_no_record() {
        let mut g = SceneGraph::new();
        add_triangle(&mut g, 50_000.0, 50_000.0);
        let list = g.get_render_list(0.0, 0.0, 1.0, 1920.0, 1080.0);
        assert!(list.is_empty(), "off-screen path must be culled");
    }

    #[test]
    fn hit_test_finds_a_path_by_its_bounds() {
        let mut g = SceneGraph::new();
        let id = add_triangle(&mut g, 50.0, 70.0);
        assert_eq!(g.hit_test(60.0, 80.0), Some(id));
        assert_eq!(g.hit_test(49.0, 69.0), None);
    }

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

    // ── Phase 6 Milestone 2: set_fill / set_size ─────────────────────────────

    #[test]
    fn set_fill_updates_render_list_color() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let id = g.add_rect(f, 0.0, 0.0, 100.0, 100.0, 255, 0, 0, 255);
        g.set_fill(id, 0, 255, 0, 128);
        let (cx, cy, z, vw, vh) = wide_cam();
        let list = g.get_render_list(cx, cy, z, vw, vh);
        // Fill occupies floats [4..8): r, g, b, a, each normalised /255.
        assert!((list[4] - 0.0).abs() < 1e-5);
        assert!((list[5] - 1.0).abs() < 1e-5);
        assert!((list[6] - 0.0).abs() < 1e-5);
        assert!((list[7] - 128.0 / 255.0).abs() < 1e-5);
    }

    #[test]
    fn set_fill_applies_to_ellipse() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let id = g.add_ellipse(f, 0.0, 0.0, 100.0, 80.0, 0, 0, 0, 255);
        g.set_fill(id, 10, 20, 30, 255);
        let (cx, cy, z, vw, vh) = wide_cam();
        let list = g.get_render_list(cx, cy, z, vw, vh);
        assert!((list[4] - 10.0 / 255.0).abs() < 1e-5);
        assert!((list[5] - 20.0 / 255.0).abs() < 1e-5);
        assert!((list[6] - 30.0 / 255.0).abs() < 1e-5);
    }

    #[test]
    fn set_fill_on_nonexistent_id_is_no_op() {
        let mut g = SceneGraph::new();
        g.set_fill(999, 1, 2, 3, 4); // must not panic
        assert_eq!(g.node_count(), 0);
    }

    #[test]
    fn set_fill_on_frame_is_no_op() {
        // Frame has no fill concept — must not panic, and must not somehow
        // turn a Frame into a renderable shape.
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        g.set_fill(f, 255, 0, 0, 255);
        let (cx, cy, z, vw, vh) = wide_cam();
        assert!(g.get_render_list(cx, cy, z, vw, vh).is_empty());
    }

    #[test]
    fn set_size_updates_bounds() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let id = g.add_rect(f, 10.0, 10.0, 20.0, 20.0, 255, 0, 0, 255);
        g.set_size(id, 40.0, 50.0);
        assert_eq!(g.get_node_bounds(id), vec![10.0, 10.0, 40.0, 50.0]);
    }

    // ── Phase 6 Milestone 3: remove_node ─────────────────────────────────────

    #[test]
    fn remove_node_decrements_count() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let id = g.add_rect(f, 0.0, 0.0, 10.0, 10.0, 255, 0, 0, 255);
        assert_eq!(g.node_count(), 2);
        assert!(g.remove_node(id));
        assert_eq!(g.node_count(), 1);
    }

    #[test]
    fn remove_node_excludes_the_node_from_hit_test() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let id = g.add_rect(f, 0.0, 0.0, 100.0, 100.0, 255, 0, 0, 255);
        assert_eq!(g.hit_test(50.0, 50.0), Some(id));
        g.remove_node(id);
        assert_eq!(g.hit_test(50.0, 50.0), None);
    }

    #[test]
    fn remove_node_excludes_the_node_from_render_list() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let id = g.add_rect(f, 0.0, 0.0, 100.0, 100.0, 255, 0, 0, 255);
        g.remove_node(id);
        let (cx, cy, z, vw, vh) = wide_cam();
        assert!(g.get_render_list(cx, cy, z, vw, vh).is_empty());
    }

    #[test]
    fn remove_node_on_nonexistent_id_is_no_op_and_returns_false() {
        let mut g = SceneGraph::new();
        assert!(!g.remove_node(999)); // must not panic
        assert_eq!(g.node_count(), 0);
    }

    #[test]
    fn remove_node_twice_returns_false_the_second_time() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let id = g.add_rect(f, 0.0, 0.0, 10.0, 10.0, 255, 0, 0, 255);
        assert!(g.remove_node(id));
        assert!(!g.remove_node(id));
        assert_eq!(g.node_count(), 1); // only the frame remains
    }

    #[test]
    fn remove_node_refuses_a_frame_with_children() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        g.add_rect(f, 0.0, 0.0, 10.0, 10.0, 255, 0, 0, 255);
        assert!(!g.remove_node(f));
        assert_eq!(g.node_count(), 2); // nothing was removed
    }

    #[test]
    fn remove_node_allows_the_frame_once_its_only_child_is_gone() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let id = g.add_rect(f, 0.0, 0.0, 10.0, 10.0, 255, 0, 0, 255);
        assert!(g.remove_node(id));
        assert!(g.remove_node(f));
        assert_eq!(g.node_count(), 0);
    }

    #[test]
    fn remove_node_never_reuses_the_freed_id() {
        // ADR-008: ids are allocated monotonically and never reused, even
        // after a remove — the next add must not collide with a tombstone.
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let id_a = g.add_rect(f, 0.0, 0.0, 10.0, 10.0, 255, 0, 0, 255);
        g.remove_node(id_a);
        let id_b = g.add_rect(f, 0.0, 0.0, 10.0, 10.0, 0, 255, 0, 255);
        assert_ne!(id_a, id_b);
    }

    #[test]
    fn set_size_on_nonexistent_id_is_no_op() {
        let mut g = SceneGraph::new();
        g.set_size(999, 40.0, 50.0); // must not panic
        assert_eq!(g.node_count(), 0);
    }

    #[test]
    fn set_size_updates_hit_test() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let id = g.add_rect(f, 0.0, 0.0, 10.0, 10.0, 255, 0, 0, 255);
        // Outside the original 10×10 box.
        assert_eq!(g.hit_test(50.0, 50.0), None);
        g.set_size(id, 100.0, 100.0);
        // Now inside the grown box.
        assert_eq!(g.hit_test(50.0, 50.0), Some(id));
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

    // ── Phase 7 Milestone 3: explicit paint order ────────────────────────────

    /// Two same-bounds rects so stacking alone decides the winner.
    fn overlapping_pair() -> (SceneGraph, u32, u32) {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let r1 = g.add_rect(f, 0.0, 0.0, 100.0, 100.0, 255, 0, 0, 255);
        let r2 = g.add_rect(f, 0.0, 0.0, 100.0, 100.0, 0, 0, 255, 255);
        (g, r1, r2)
    }

    #[test]
    fn move_node_to_back_changes_the_topmost_hit() {
        let (mut g, r1, r2) = overlapping_pair();
        assert_eq!(g.hit_test(50.0, 50.0), Some(r2));
        g.move_node_to_index(r2, 0);
        assert_eq!(g.hit_test(50.0, 50.0), Some(r1));
    }

    #[test]
    fn move_node_to_index_clamps_past_the_top() {
        let (mut g, _r1, r2) = overlapping_pair();
        g.move_node_to_index(r2, 0);
        g.move_node_to_index(r2, 999);
        assert_eq!(g.hit_test(50.0, 50.0), Some(r2));
    }

    #[test]
    fn move_node_to_index_on_missing_id_is_a_no_op() {
        let (mut g, _r1, r2) = overlapping_pair();
        g.move_node_to_index(4242, 0);
        assert_eq!(g.hit_test(50.0, 50.0), Some(r2));
        assert_eq!(g.node_count(), 3);
    }

    #[test]
    fn move_node_to_index_on_removed_id_is_a_no_op() {
        let (mut g, r1, r2) = overlapping_pair();
        assert!(g.remove_node(r2));
        g.move_node_to_index(r2, 0);
        assert_eq!(g.hit_test(50.0, 50.0), Some(r1));
    }

    #[test]
    fn render_list_follows_paint_order_not_id_order() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let r1 = g.add_rect(f, 0.0, 0.0, 100.0, 100.0, 255, 0, 0, 255);
        g.add_rect(f, 200.0, 0.0, 100.0, 100.0, 0, 0, 255, 255);
        // Splice r1 (x = 0) to the top: the LAST 16-float record must now
        // be r1's, so its x leads the final stride.
        g.move_node_to_index(r1, 99);
        let (cx, cy, z, vw, vh) = wide_cam();
        let out = g.get_render_list(cx, cy, z, vw, vh);
        assert_eq!(out.len(), 32);
        assert_eq!(out[16], 0.0);
        assert_eq!(out[0], 200.0);
    }

    #[test]
    fn remove_node_splices_the_paint_order() {
        let mut g = SceneGraph::new();
        let f = g.add_frame(0.0, 0.0, 1000.0, 800.0);
        let r1 = g.add_rect(f, 0.0, 0.0, 100.0, 100.0, 255, 0, 0, 255);
        let r2 = g.add_rect(f, 0.0, 0.0, 100.0, 100.0, 0, 255, 0, 255);
        let r3 = g.add_rect(f, 0.0, 0.0, 100.0, 100.0, 0, 0, 255, 255);
        assert!(g.remove_node(r2));
        assert_eq!(g.hit_test(50.0, 50.0), Some(r3));
        g.move_node_to_index(r3, 0);
        assert_eq!(g.hit_test(50.0, 50.0), Some(r1));
    }

    #[test]
    fn undone_delete_restores_original_stacking_via_append_then_move() {
        // The M3 story end-to-end at the graph level: bottom shape deleted,
        // then restored by the worker's append-then-move — it must land
        // back UNDER the survivor, exactly where it was.
        let (mut g, r1, r2) = overlapping_pair();
        assert!(g.remove_node(r1));
        let restored = g.add_rect(0, 0.0, 0.0, 100.0, 100.0, 255, 0, 0, 255);
        assert_eq!(g.hit_test(50.0, 50.0), Some(restored)); // appended on top…
        g.move_node_to_index(restored, 1); // …then spliced to its old slot
        assert_eq!(g.hit_test(50.0, 50.0), Some(r2));
    }

    #[test]
    fn moving_a_frame_is_allowed_but_frames_still_never_hit() {
        let (mut g, _r1, r2) = overlapping_pair();
        g.move_node_to_index(0, 999);
        assert_eq!(g.hit_test(50.0, 50.0), Some(r2));
    }

    #[test]
    fn ids_stay_stable_across_moves() {
        let (mut g, r1, r2) = overlapping_pair();
        g.move_node_to_index(r1, 999);
        g.move_node_to_index(r2, 0);
        assert_eq!(g.get_node_bounds(r1), vec![0.0, 0.0, 100.0, 100.0]);
        assert_eq!(g.get_node_bounds(r2), vec![0.0, 0.0, 100.0, 100.0]);
    }
}
