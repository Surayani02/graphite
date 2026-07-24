import { Suspense, lazy } from "react";
import { useExport } from "./useExport";

const ExportDialogLazy = lazy(async () => ({
  default: (await import("./ExportDialog")).ExportDialog,
}));

/**
 * Mounts the export dialog against the shared export state (Phase 7 M4)
 * through an always-rendered lazy boundary (Phase 8 PC-2 — ADR-033).
 * Renders nothing while closed, exactly as before; the dialog's code ships
 * in a deferred chunk requested at the shell's first render instead of in
 * the ADR-024-gated main chunk. Sits beside the palette host in the shell
 * so the command's `open()` and this dialog reference one ExportProvider
 * instance.
 */
export function ExportDialogHost() {
  const { isDialogOpen, setDialogOpen, runExport } = useExport();
  return (
    <Suspense fallback={null}>
      <ExportDialogLazy isOpen={isDialogOpen} onOpenChange={setDialogOpen} onExport={runExport} />
    </Suspense>
  );
}
