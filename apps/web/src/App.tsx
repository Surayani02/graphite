import EngineCanvas from "./components/EngineCanvas";

/**
 * Root application shell.
 *
 * Phase 1: full-viewport GPU canvas.
 * Phase 6 will wrap this with the toolbar, layer panel, and properties panel.
 */
const App = function () {
  return (
    <div style={{ width: "100%", height: "100%", background: "#0f1016" }}>
      <EngineCanvas />
    </div>
  );
};

export default App;
