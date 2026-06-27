import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const container = document.getElementById("root");

if (!container) {
  throw new Error(
    "[Graphite] Root element #root not found. " +
      'Ensure index.html contains <div id="root"></div>.'
  );
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
