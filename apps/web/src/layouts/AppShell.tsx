import { EngineProvider } from "../context/EngineContext";
import { TopToolbar } from "../components/TopToolbar";
import { StatusBar } from "../components/StatusBar";
import { LayersPanel } from "../components/LayersPanel";
import { InspectorPanel } from "../components/InspectorPanel";
import { EngineCanvas } from "../components/EngineCanvas";

/**
 * Root editor shell — Phase 6 Milestone 1.
 *
 * Grid layout: header (toolbar) / body (layers | viewport | inspector) /
 * footer (status bar). EngineProvider wraps the whole shell so every panel
 * reads live engine state via useEngineContext() without prop drilling,
 * while UI-only state (tool, panel visibility) lives in Zustand.
 */
export function AppShell() {
  return (
    <EngineProvider>
      <div className="grid h-screen grid-rows-[auto_1fr_auto] bg-surface-canvas text-content-primary">
        <TopToolbar />
        <div className="grid grid-cols-[auto_1fr_auto] overflow-hidden">
          <LayersPanel />
          <EngineCanvas />
          <InspectorPanel />
        </div>
        <StatusBar />
      </div>
    </EngineProvider>
  );
}
