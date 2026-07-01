import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/index.css";

/**
 * StrictMode is intentionally omitted — see ADR-003. It is incompatible
 * with canvas.transferControlToOffscreen()'s one-way transfer, which the
 * engine worker depends on.
 */
const container = document.getElementById("root");

if (!container) {
  throw new Error("[Graphite] Root element #root not found in index.html.");
}

createRoot(container).render(<App />);
