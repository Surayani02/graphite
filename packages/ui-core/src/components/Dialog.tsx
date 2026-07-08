import type { ReactNode } from "react";
import { Dialog as AriaDialog, Modal, ModalOverlay } from "react-aria-components";

interface ModalDialogProps {
  /** Controlled visibility — the dialog renders nothing while closed. */
  isOpen: boolean;
  /** Fired with `false` on Escape, backdrop click, or programmatic close. */
  onOpenChange: (isOpen: boolean) => void;
  /** Accessible name (dialogs here are chrome, not documents — no visible heading required). */
  label: string;
  children: ReactNode;
  /** Tailwind width utilities for the panel, default `w-full max-w-xl`. */
  widthClassName?: string;
}

/**
 * Focus-trapped modal dialog — ui-core's React Aria adoption point
 * (ADR-015; the gate the Blueprint deferred to "M4's command-palette
 * combobox"). react-aria-components owns the hard parts hand-rolls get
 * wrong: focus containment, focus restore to the invoker, Escape and
 * backdrop dismissal, `aria-modal`, and inerting the page behind the
 * overlay. This wrapper owns only the Graphite look: dimmed backdrop,
 * top-third placement (command-palette convention — stable position, no
 * vertical jumping as content height changes), panel surface + elevation.
 *
 * No open/close animation by design: Blueprint calls for purposeful motion
 * only, and a sub-50ms surface (see palette target) should simply appear.
 */
export function ModalDialog({
  isOpen,
  onOpenChange,
  label,
  children,
  widthClassName = "w-full max-w-xl",
}: ModalDialogProps) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[15vh]"
    >
      <Modal className={widthClassName}>
        <AriaDialog
          aria-label={label}
          className="rounded-lg border border-border-subtle bg-surface-panel shadow-lg focus:outline-none"
        >
          {children}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
