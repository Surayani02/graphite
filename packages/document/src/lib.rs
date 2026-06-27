//! Graphite Document Model
//!
//! Phase 0: Foundation scaffold.
//!
//! # Architecture (to be populated in Phase 5)
//!
//! - `schema`        — Node type definitions and the document schema.
//! - `operations`    — Document mutations and the operation log.
//! - `serialization` — Binary (MessagePack / FlatBuffers) and JSON serialization.

use serde::{Deserialize, Serialize};

/// Returns the document crate version string.
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// Placeholder node identifier.
///
/// Will be replaced with a UUID-backed newtype in Phase 5.
/// Defined here to establish the type boundary between the document model
/// and the scene graph from the very beginning.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct NodeId(String);

impl NodeId {
    /// Creates a `NodeId` from any string.
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    /// Returns the inner string slice.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for NodeId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_is_not_empty() {
        assert!(!version().is_empty());
    }

    #[test]
    fn node_id_roundtrips_through_display() {
        let id = NodeId::new("abc-123");
        assert_eq!(id.to_string(), "abc-123");
        assert_eq!(id.as_str(), "abc-123");
    }

    #[test]
    fn node_id_equality() {
        let a = NodeId::new("same");
        let b = NodeId::new("same");
        let c = NodeId::new("different");
        assert_eq!(a, b);
        assert_ne!(a, c);
    }

    #[test]
    fn node_id_serialises_to_json_string() {
        let id = NodeId::new("node-xyz");
        let json = serde_json::to_string(&id).expect("NodeId must serialise to JSON");
        // Serde serialises a newtype struct as its inner value.
        assert!(json.contains("node-xyz"), "JSON was: {json}");
    }

    #[test]
    fn node_id_deserialises_from_json() {
        let json = r#""round-trip-id""#;
        let id: NodeId =
            serde_json::from_str(json).expect("NodeId must deserialise from JSON string");
        assert_eq!(id.as_str(), "round-trip-id");
    }
}
