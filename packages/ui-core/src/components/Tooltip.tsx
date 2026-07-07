import { cloneElement, useState, type ReactElement, type Ref } from "react";
import {
  useFloating,
  useHover,
  useFocus,
  useDismiss,
  useRole,
  useInteractions,
  useMergeRefs,
  offset,
  flip,
  shift,
  FloatingPortal,
  autoUpdate,
} from "@floating-ui/react";

interface TooltipProps {
  /** Tooltip text. */
  label: string;
  /** Rendered as a `<kbd>` after the label, e.g. "R" or "Ctrl+S". */
  shortcut?: string;
  /**
   * A single element that becomes the reference — its own event handlers
   * and ref are preserved and merged with the tooltip's. Typed with a
   * `Record<string, unknown>` prop bound (rather than bare `ReactElement`,
   * whose default prop type isn't spreadable) since `.props` is spread
   * onto the merged prop getter below.
   */
  children: ReactElement<Record<string, unknown>>;
}

/**
 * Hover/focus tooltip built on Floating UI's interaction hooks.
 *
 * Shown on hover (400ms delay, so moving the pointer across a toolbar
 * doesn't flash every label) and on keyboard focus (no delay — a keyboard
 * user has already committed to landing on this element). Dismissible with
 * Escape; `role="tooltip"` + `aria-describedby` wired automatically by
 * `useRole`.
 */
export function Tooltip({ label, shortcut, children }: TooltipProps) {
  const [open, setOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom",
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip(), shift({ padding: 8 })],
  });

  const hover = useHover(context, { move: false, delay: { open: 400, close: 0 } });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);

  // React 19 removed the special `element.ref` field in favour of ref
  // being a regular prop — reading `children.props.ref` (not
  // `children.ref`) is the documented, non-deprecated way to pick up a
  // ref the caller already put on their own element, so it can be merged
  // with this component's own reference ref rather than overwritten.
  const childProps = children.props as Record<string, unknown> & { ref?: Ref<unknown> };
  const mergedRef = useMergeRefs([refs.setReference, childProps.ref ?? null]);

  return (
    <>
      {cloneElement(children, getReferenceProps({ ...childProps, ref: mergedRef }))}
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="pointer-events-none z-50 flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface-panel px-2 py-1 font-mono text-[11px] text-content-primary shadow-lg"
          >
            <span>{label}</span>
            {shortcut && (
              <kbd className="rounded border border-border-subtle bg-surface-canvas/60 px-1 text-[10px] text-content-tertiary">
                {shortcut}
              </kbd>
            )}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
