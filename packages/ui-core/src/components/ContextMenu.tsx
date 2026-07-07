import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  useFloating,
  useInteractions,
  useListNavigation,
  useTypeahead,
  useDismiss,
  useRole,
  FloatingPortal,
  FloatingFocusManager,
  offset,
  flip,
  shift,
} from "@floating-ui/react";

export interface MenuItem {
  readonly id: string;
  readonly label: string;
  /** Any lucide-react icon component, e.g. `Trash2`. */
  readonly icon?: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  readonly shortcut?: string;
  readonly disabled?: boolean;
  /** Renders in the danger color (e.g. destructive actions like Delete). */
  readonly danger?: boolean;
  readonly onSelect: () => void;
}

export interface MenuPosition {
  readonly x: number;
  readonly y: number;
}

interface ContextMenuProps {
  open: boolean;
  /** Viewport coordinates (e.g. from a `contextmenu` event's clientX/Y). */
  position: MenuPosition;
  items: readonly MenuItem[];
  onClose: () => void;
}

/**
 * Right-click menu pinned to a point rather than an element — the
 * reference is a virtual element (`setPositionReference`) updated whenever
 * `position` changes, so the same floating/interaction setup used for
 * element-anchored floating UI works unmodified for a cursor-anchored one.
 *
 * Full menu keyboard pattern: arrow-key roving focus + loop
 * (`useListNavigation`), typeahead (`useTypeahead`, a second parallel ref
 * of item *labels* rather than DOM nodes — Floating UI's own API shape),
 * Escape/outside-click dismiss, and a focus trap that returns focus to
 * whatever triggered the menu on close (`FloatingFocusManager`).
 */
export function ContextMenu({ open, position, items, onClose }: ContextMenuProps) {
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (nextOpen) => {
      if (!nextOpen) onClose();
    },
    placement: "bottom-start",
    middleware: [offset(4), flip(), shift({ padding: 8 })],
  });

  useEffect(() => {
    if (!open) return;
    refs.setPositionReference({
      getBoundingClientRect: () => ({
        x: position.x,
        y: position.y,
        top: position.y,
        left: position.x,
        right: position.x,
        bottom: position.y,
        width: 0,
        height: 0,
      }),
    });
  }, [open, position, refs]);

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const elementsRef = useRef<Array<HTMLElement | null>>([]);
  const labelsRef = useRef<Array<string | null>>([]);

  const listNav = useListNavigation(context, {
    listRef: elementsRef,
    activeIndex,
    onNavigate: setActiveIndex,
    loop: true,
  });
  const typeahead = useTypeahead(context, {
    listRef: labelsRef,
    activeIndex,
    onMatch: setActiveIndex,
  });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "menu" });

  const { getFloatingProps, getItemProps } = useInteractions([listNav, typeahead, dismiss, role]);

  if (!open) return null;

  return (
    <FloatingPortal>
      <FloatingFocusManager context={context} modal={false}>
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          {...getFloatingProps()}
          className="z-50 min-w-[180px] rounded-md border border-border-subtle bg-surface-panel py-1 font-mono text-[12px] shadow-lg focus:outline-none"
        >
          {items.map((item, index) => {
            const Icon = item.icon;
            const activate = () => {
              item.onSelect();
              onClose();
            };
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                tabIndex={activeIndex === index ? 0 : -1}
                ref={(node) => {
                  elementsRef.current[index] = node;
                  labelsRef.current[index] = item.label;
                }}
                {...getItemProps({
                  onClick: activate,
                  // Explicit rather than relying on the browser's native
                  // Enter/Space-on-focused-button → click synthesis: this
                  // button's role is "menuitem", not "button", and that
                  // native behaviour is not guaranteed for a repurposed
                  // role across browsers (and doesn't happen at all in
                  // jsdom, which is how the test suite caught this).
                  onKeyDown(e) {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      activate();
                    }
                  },
                })}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-40 ${
                  item.danger
                    ? "text-danger hover:bg-danger/10"
                    : "text-content-primary hover:bg-surface-panel-hover"
                }`}
              >
                {Icon && <Icon size={14} aria-hidden />}
                <span className="flex-1">{item.label}</span>
                {item.shortcut && (
                  <kbd className="text-[10px] text-content-tertiary">{item.shortcut}</kbd>
                )}
              </button>
            );
          })}
        </div>
      </FloatingFocusManager>
    </FloatingPortal>
  );
}

/**
 * Open/position/close bookkeeping every `ContextMenu` consumer needs —
 * bundled as this primitive's natural companion hook rather than
 * duplicated at each call site (canvas right-click, Layers-row right-click).
 */
export function useContextMenuState() {
  const [state, setState] = useState<{ open: boolean; position: MenuPosition }>({
    open: false,
    position: { x: 0, y: 0 },
  });

  return {
    open: state.open,
    position: state.position,
    show: (x: number, y: number) => {
      setState({ open: true, position: { x, y } });
    },
    close: () => {
      setState((s) => ({ ...s, open: false }));
    },
  };
}
