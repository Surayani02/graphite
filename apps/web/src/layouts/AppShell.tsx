import { EngineProvider } from "../contexts/EngineContext";
import { TopToolbar } from "../components/TopToolbar";
import { StatusBar } from "../components/StatusBar";
import { ToolsRail } from "../features/tools/ToolsRail";
import { LayersPanel } from "../features/layers/LayersPanel";
import { InspectorPanel } from "../features/inspector/InspectorPanel";
import { EngineCanvas } from "../components/EngineCanvas";

/**
 * Root editor shell — Phase 6 Milestone 1, tools rail added Milestone 3.
 *
 * Grid layout: header (toolbar) / body (tools | layers | viewport |
 * inspector) / footer (status bar). EngineProvider wraps the whole shell
 * so every panel reads live engine state via useEngineContext() without
 * prop drilling, while UI-only state (tool, panel visibility) lives in
 * Zustand. ToolsRail sits left of Layers — a separate column, not folded
 * into Layers' own width, since M5's panel registry will dock/undock them
 * independently.
 */
export function AppShell() {
  return (
    <EngineProvider>
      <div className="grid h-screen grid-rows-[auto_1fr_auto] bg-surface-canvas text-content-primary">
        <TopToolbar />
        <div className="grid grid-cols-[auto_auto_1fr_auto] overflow-hidden">
          <ToolsRail />
          <LayersPanel />
          <EngineCanvas />
          <InspectorPanel />
        </div>
        <StatusBar />
      </div>
    </EngineProvider>
  );
}
