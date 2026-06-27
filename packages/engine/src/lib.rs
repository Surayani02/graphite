//! Graphite Graphics Engine
//!
//! Phase 0: Foundation scaffold.
//!
//! # Architecture (to be populated in later phases)
//!
//! - **Phase 1** — WebGPU context, OffscreenCanvas, render loop.
//! - **Phase 2** — Scene graph, R-tree spatial index, transform math.
//! - **Phase 3** — GPU path rendering (rectangles, ellipses, fills, strokes).
//! - **Phase 4** — Hit testing, selection, pan/zoom interaction.
//!
//! # Compilation targets
//!
//! This crate compiles to:
//! - A native Rust library (`rlib`) for tests and benchmarks.
//! - A WebAssembly module (`cdylib`, added in Phase 1) for the browser.

/// Returns the engine version string derived from `Cargo.toml`.
///
/// The TypeScript host uses this to assert the loaded WASM module version
/// matches the expected version at runtime.
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_is_not_empty() {
        assert!(!version().is_empty(), "Engine version must not be empty");
    }

    #[test]
    fn version_is_semver_like() {
        // Minimal check: must contain at least one dot (e.g. "0.1.0").
        assert!(
            version().contains('.'),
            "Engine version must be semver-like, got: {ver}",
            ver = version()
        );
    }
}
