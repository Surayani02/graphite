//! Graphite Backend Server
//!
//! Phase 0: Scaffold — compiles and exits cleanly.
//!
//! # Roadmap
//! - **Phase 8** — REST API, JWT auth, PostgreSQL persistence via SQLx.
//! - **Phase 9** — WebSocket hub for real-time CRDT sync, Redis for presence.

fn main() {
    println!(
        "Graphite server v{version} — backend implementation starts in Phase 8.",
        version = env!("CARGO_PKG_VERSION")
    );
}

#[cfg(test)]
mod tests {
    /// Smoke test: the server binary compiles and the main function is callable.
    /// Real server tests will be added in Phase 8.
    #[test]
    fn binary_compiles() {
        // Intentionally empty — compilation itself is the assertion.
    }
}
