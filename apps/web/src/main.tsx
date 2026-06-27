import { createRoot } from "react-dom/client";
import App from "./App";

/**
 * StrictMode is intentionally omitted.
 *
 * canvas.transferControlToOffscreen() is a permanent one-way operation: once
 * a canvas is transferred to a Web Worker the browser permanently rejects any
 * write to canvas.width / canvas.height on the main thread, even after the
 * worker is terminated.  React StrictMode invokes every effect twice in
 * development — the second invocation tries to reset those properties and
 * receives an InvalidStateError.
 *
 * This is a well-known, accepted trade-off for canvas-based engines.
 * The correct long-term fix (Phase 7+) is an ImageBitmap composition path
 * where the DOM canvas is never transferred at all.
 * See: https://github.com/facebook/react/issues/24502
 */
const container = document.getElementById("root");

if (!container) {
  throw new Error("[Graphite] Root element #root not found in index.html.");
}

createRoot(container).render(<App />);
