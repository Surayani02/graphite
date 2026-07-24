import { ModalDialog } from "@graphite/ui-core";

/**
 * The unsaved-changes confirm dialog (Phase 7 M2), extracted from
 * `FilesProvider` at Phase 8 PC-2 (ADR-033) so the provider can mount it
 * through an always-rendered lazy boundary. It was the last *eager*
 * `ModalDialog` consumer — with it deferred, the whole react-aria dialog
 * subtree leaves the startup chunk set. Behaviour is unchanged: renders
 * nothing while `pending` is null; Cancel keeps the document, Discard runs
 * the deferred action.
 */
export function DiscardConfirmDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: "open" | "new" | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ModalDialog
      isOpen={pending !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel();
      }}
      label="Unsaved changes"
      widthClassName="w-full max-w-sm"
    >
      <div className="p-4">
        <p className="text-sm text-content-primary">
          {pending === "open" ? "Open another file?" : "Start a new document?"}
        </p>
        <p className="mt-1 text-xs text-content-tertiary">
          Unsaved changes will be lost. Save first with <span className="font-mono">mod+S</span>.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-2.5 py-1 font-mono text-xs text-content-secondary hover:bg-surface-panel-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded px-2.5 py-1 font-mono text-xs text-danger hover:bg-surface-panel-hover"
          >
            Discard changes
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
