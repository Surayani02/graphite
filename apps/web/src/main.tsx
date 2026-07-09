import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import "./styles/index.css";

/**
 * StrictMode is intentionally omitted — see ADR-003. It is incompatible
 * with canvas.transferControlToOffscreen()'s one-way transfer, which the
 * engine worker depends on.
 *
 * M5: the app is now a RouterProvider (ADR-016). App.tsx is retired — the
 * editor shell it used to render is the "/" route (routes/index.tsx).
 */
const container = document.getElementById("root");

if (!container) {
  throw new Error("[Graphite] Root element #root not found in index.html.");
}

createRoot(container).render(<RouterProvider router={router} />);
