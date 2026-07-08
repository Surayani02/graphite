import { EngineProvider } from "../contexts/EngineContext";
import { TopToolbar } from "../components/TopToolbar";
import { StatusBar } from "../components/StatusBar";
import { ToolsRail } from "../features/tools/ToolsRail";
import { InspectorPanel } from "../features/inspector/InspectorPanel";
import { EngineCanvas } from "../components/EngineCanvas";
import { ensureBuiltinCommands } from "../features/commands/builtin";
import { CommandPalette } from "../features/palette/CommandPalette";
import { ShortcutProvider } from "../features/shortcuts/ShortcutProvider";
import { ShortcutRecorderDialog } from "../features/shortcuts/ShortcutRecorderDialog";
import { LeftPanel } from "./LeftPanel";

// Composition root is where the command registry fills: module scope, so
// every builtin exists before first paint — the palette's <50ms open budget
// never pays for registration, and ShortcutProvider resolves a complete map
// on its first render. Idempotent, so HMR re-imports are safe.
ensureBuiltinCommands();

/**
 * Root editor shell — Phase 6 Milestone 1; tools rail added Milestone 3;
 * command layer, palette, recorder, and the tabbed left panel added
 * Milestone 4.
 *
 * Grid layout: header (toolbar) / body (tools | left panel | viewport |
 * inspector) / footer (status bar). EngineProvider wraps the whole shell
 * so every panel reads live engine state via useEngineContext() without
 * prop drilling, while UI-only state (tool, panel visibility) lives in
 * Zustand. ShortcutProvider sits directly inside EngineProvider — it
 * needs engine context to build the dispatch context, and everything
 * below it (including the modals) shares one global key owner. The
 * palette and recorder mount here permanently and render nothing while
 * closed.
 */
export function AppShell() {
  return (
    <EngineProvider>
      <ShortcutProvider>
        <div className="grid h-screen grid-rows-[auto_1fr_auto] bg-surface-canvas text-content-primary">
          <TopToolbar />
          <div className="grid grid-cols-[auto_auto_1fr_auto] overflow-hidden">
            <ToolsRail />
            <LeftPanel />
            <EngineCanvas />
            <InspectorPanel />
          </div>
          <StatusBar />
        </div>
        <CommandPalette />
        <ShortcutRecorderDialog />
      </ShortcutProvider>
    </EngineProvider>
  );
}
