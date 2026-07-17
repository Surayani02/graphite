import { ExportDialog } from "./ExportDialog";
import { useExport } from "./useExport";

/**
 * Mounts the export dialog against the shared export state (Phase 7 M4).
 * Renders nothing while closed. Sits beside CommandPalette in the shell so
 * the command's `open()` and this dialog reference one ExportProvider
 * instance.
 */
export function ExportDialogHost() {
  const { isDialogOpen, setDialogOpen, runExport } = useExport();
  return <ExportDialog isOpen={isDialogOpen} onOpenChange={setDialogOpen} onExport={runExport} />;
}
