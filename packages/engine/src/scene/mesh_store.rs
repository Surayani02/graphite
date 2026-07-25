//! Tessellation handle arena (ADR-032 §3).
//!
//! wasm-bindgen returns one typed array per call, so a tessellation that
//! yields both positions and indices cannot cross in a single call —
//! and packing `u32` indices into an `f32` payload has a 2^24 cliff.
//! The boundary is therefore explicit: `tessellate_path` produces a
//! **handle**, and the host reads `mesh_positions` / `mesh_indices`
//! against it before calling `mesh_free`. One tessellation, three cheap
//! crossings, no hidden "last result" state.
//!
//! Handles are monotonic and never reused. A `HashMap` rather than a
//! slot vector is deliberate: a vector would either reuse handles (ABA —
//! a stale handle silently addressing someone else's mesh) or retain a
//! `None` per freed handle forever, which at a few tessellations per
//! path per session is unbounded. The map's live-set memory is exactly
//! the meshes the host still holds.

use graphite_geometry::Mesh;
use std::collections::HashMap;

/// Sentinel returned by fallible handle-producing calls.
pub const INVALID_HANDLE: u32 = u32::MAX;

/// Monotonic-handle store for tessellated meshes.
#[derive(Debug, Default)]
pub struct MeshStore {
    meshes: HashMap<u32, Mesh>,
    next: u32,
}

impl MeshStore {
    /// Empty store; the first handle issued is 1 (0 stays free as a
    /// falsy sentinel for hosts that want one, [`INVALID_HANDLE`] is the
    /// error value).
    pub fn new() -> Self {
        Self {
            meshes: HashMap::new(),
            next: 1,
        }
    }

    /// Stores `mesh` and returns its handle. Returns [`INVALID_HANDLE`]
    /// if the handle space is exhausted — unreachable in practice
    /// (2^32 − 2 tessellations in one session) but never silently wrong.
    pub fn insert(&mut self, mesh: Mesh) -> u32 {
        if self.next == INVALID_HANDLE {
            return INVALID_HANDLE;
        }
        let handle = self.next;
        self.next += 1;
        self.meshes.insert(handle, mesh);
        handle
    }

    /// Borrows a stored mesh, or `None` if the handle is unknown or freed.
    pub fn get(&self, handle: u32) -> Option<&Mesh> {
        self.meshes.get(&handle)
    }

    /// Drops a stored mesh. Returns whether the handle was live —
    /// double frees are tolerated silently, in the arena's existing style.
    pub fn free(&mut self, handle: u32) -> bool {
        self.meshes.remove(&handle).is_some()
    }

    /// Number of live meshes. The host is expected to free promptly, so
    /// a growing value across idle frames is a leak, and the worker's
    /// cache tests assert against it.
    pub fn len(&self) -> usize {
        self.meshes.len()
    }

    /// True when no mesh is currently held.
    pub fn is_empty(&self) -> bool {
        self.meshes.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mesh(v: f32) -> Mesh {
        Mesh {
            positions: vec![v, v, v + 1.0, v, v, v + 1.0],
            indices: vec![0, 1, 2],
        }
    }

    #[test]
    fn handles_are_monotonic_and_never_reused() {
        let mut store = MeshStore::new();
        let a = store.insert(mesh(0.0));
        let b = store.insert(mesh(10.0));
        assert_ne!(a, b);
        assert!(store.free(a));
        let c = store.insert(mesh(20.0));
        assert_ne!(c, a, "a freed handle must never be reissued");
        assert_ne!(c, b);
    }

    #[test]
    fn get_returns_the_stored_mesh_then_nothing_after_free() {
        let mut store = MeshStore::new();
        let handle = store.insert(mesh(5.0));
        assert_eq!(store.get(handle).map(|m| m.indices.len()), Some(3));
        assert!(store.free(handle));
        assert!(store.get(handle).is_none());
        assert!(store.is_empty());
    }

    #[test]
    fn freeing_an_unknown_handle_is_tolerated() {
        let mut store = MeshStore::new();
        assert!(!store.free(INVALID_HANDLE));
        assert!(!store.free(4_242));
        let handle = store.insert(mesh(1.0));
        assert!(store.free(handle));
        assert!(!store.free(handle), "double free reports not-live");
    }

    #[test]
    fn len_tracks_the_live_set() {
        let mut store = MeshStore::new();
        assert_eq!(store.len(), 0);
        let handles: Vec<u32> = (0..4).map(|i| store.insert(mesh(i as f32))).collect();
        assert_eq!(store.len(), 4);
        for h in handles {
            store.free(h);
        }
        assert_eq!(store.len(), 0);
    }
}
