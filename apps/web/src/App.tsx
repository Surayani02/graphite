import { FRAME_BUDGET_MS, TARGET_FPS, MVP_MAX_OBJECTS } from "@graphite/protocol";

/**
 * Root application component.
 *
 * Phase 0: Foundation placeholder — verifies the protocol package is
 * reachable and that performance constants are defined correctly.
 *
 * Phase 6 will replace this with the full design editor shell.
 */
export function App() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: "12px",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", fontWeight: 500, margin: 0, letterSpacing: "-0.01em" }}>
        Graphite
      </h1>
      <p style={{ color: "#8b949e", margin: 0, fontSize: "0.875rem" }}>Phase 0 — Foundation ✓</p>
      <p style={{ color: "#30363d", margin: 0, fontSize: "0.75rem", fontFamily: "monospace" }}>
        {TARGET_FPS} fps · {FRAME_BUDGET_MS.toFixed(2)} ms/frame ·{" "}
        {MVP_MAX_OBJECTS.toLocaleString()} obj MVP target
      </p>
    </div>
  );
}
