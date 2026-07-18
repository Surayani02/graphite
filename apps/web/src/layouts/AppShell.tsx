import { EngineProvider } from "../contexts/EngineContext";
import { FilesProvider } from "../features/files/FilesProvider";
import { TopToolbar } from "../components/TopToolbar";
import { StatusBar } from "../components/StatusBar";
import { ToolsRail } from "../features/tools/ToolsRail";
import { EngineCanvas } from "../components/EngineCanvas";
import { ensureBuiltinCommands } from "../features/commands/builtin";
import { CommandPalette } from "../features/palette/CommandPalette";
import { ExportProvider } from "../features/export/useExport";
import { ExportDialogHost } from "../features/export/ExportDialogHost";
import { ShortcutProvider } from "../features/shortcuts/ShortcutProvider";
import { ShortcutRecorderDialog } from "../features/shortcuts/ShortcutRecorderDialog";
import { ensureBuiltinPanels } from "../features/panels/builtinPanels";
import { PanelAreaSlot } from "../features/panels/PanelArea";

// Composition root fills both registries at module scope, so every builtin
// command and panel exists before first paint — the palette's <50ms open
// budget never pays for registration, and ShortcutProvider resolves a
// complete map on first render. Both are idempotent (HMR-safe).
ensureBuiltinCommands();
ensureBuiltinPanels();

/**
 * Root editor shell — Phase 6 M1; tools rail M3; command layer, palette,
 * recorder, tabbed left panel M4; panels rendered from the PanelDescriptor
 * registry M5 (ADR-018).
 *
 * Grid: header (toolbar) / body (tools | left area | viewport | right area)
 * / footer (status bar). The left and right columns are now
 * <PanelAreaSlot>s — the shell places areas, the registry decides which
 * panels fill them. EngineProvider + ShortcutProvider wrap the shell (this
 * is the editor route "/"); the palette and recorder mount here and render
 * nothing while closed.
 */
export function AppShell() {
  return (
    <EngineProvider>
      <FilesProvider>
        <ExportProvider>
          <ShortcutProvider>
            <div className="grid h-screen grid-rows-[auto_1fr_auto] bg-surface-canvas text-content-primary">
              <TopToolbar />
              {/* grid-rows-[minmax(0,1fr)]: the single row is definite —
                  exactly the 1fr track height — so a panel whose *content*
                  is taller than the window (10k Layers rows) scrolls inside
                  its own overflow chain instead of inflating the implicit
                  auto row and stretching every sibling with it, canvas
                  included (M5-FR1: a 240,044-px-tall row resized the
                  swap-chain past the GPU's 8,192-px texture limit and
                  killed every frame). */}
              <div className="grid grid-cols-[auto_auto_1fr_auto] grid-rows-[minmax(0,1fr)] overflow-hidden">
                <ToolsRail />
                <PanelAreaSlot area="left" />
                <EngineCanvas />
                <PanelAreaSlot area="right" />
              </div>
              <StatusBar />
            </div>
            <CommandPalette />
            <ShortcutRecorderDialog />
            <ExportDialogHost />
          </ShortcutProvider>
        </ExportProvider>
      </FilesProvider>
    </EngineProvider>
  );
}
