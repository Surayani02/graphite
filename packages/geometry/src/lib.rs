//! Graphite path geometry — Phase 8 M1 (ADR-031, ADR-032).
//!
//! Pure geometry: the §D.1 path types, lyon fill/stroke tessellation, and
//! cull-grade control-polygon bounds. Layer position (§B.1): an internal
//! crate with **no wasm-bindgen surface of its own** — `graphite-engine`
//! depends on it and re-exports capability through the one existing WASM
//! artifact's mesh-handle API. Independently `cargo test`-able and
//! `cargo bench`-able; lyon types never escape this crate.
//!
//! Scope fences, recorded where they bite: booleans are **not** lyon's
//! job here (M3 gets its own evaluation and ADR — ADR-031); dash patterns
//! need `lyon_algorithms`' path measure and land with C1.15 in M2+
//! (ADR-032), which is why the workspace pins lyon *component* crates
//! rather than the umbrella.

#![warn(missing_docs)]

mod convert;

pub mod bounds;
pub mod corpus;
pub mod fill;
pub mod stroke;
pub mod types;

pub use bounds::bounds;
pub use fill::tessellate_fill;
pub use stroke::tessellate_stroke;
pub use types::{
    Contour, FillRule, LineCap, LineJoin, Mesh, PathGeometry, PathPoint, StrokeStyle,
    TessellationError,
};
