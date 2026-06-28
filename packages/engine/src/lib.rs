//! Graphite Engine — Phase 2: Scene Graph Core
//!
//! This crate compiles to:
//! - `cdylib` → WebAssembly module for the browser
//! - `rlib`   → native library for `cargo test` and `cargo bench`
//!
//! Public API surface (all behind `#[wasm_bindgen]`):
//! - `version()` → string
//! - `SceneGraph` → arena scene graph with `add_frame`, `add_rect`,
//!   `get_render_list`

use wasm_bindgen::prelude::*;

pub mod math;
pub mod scene;

pub use scene::graph::SceneGraph;

/// Returns the engine crate version from `Cargo.toml`.
///
/// The TypeScript host calls this after WASM initialisation to assert
/// that the loaded module version matches the expected build.
#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_is_not_empty() {
        assert!(!version().is_empty());
    }

    #[test]
    fn version_is_semver_like() {
        assert!(version().contains('.'), "expected semver, got: {}", version());
    }
}