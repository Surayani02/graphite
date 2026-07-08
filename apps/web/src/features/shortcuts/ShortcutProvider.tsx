import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useEngineContext } from "../../contexts/EngineContext";
import { useUIStore } from "../../stores/uiStore";
import { commandRegistry, type CommandRegistry } from "../commands/registry";
import { useCommandContext } from "../commands/useCommandContext";
import { chordFromEvent, detectChordPlatform } from "./chord";
import { isEditableTarget } from "./isEditableTarget";
import { useResolvedShortcuts } from "./useResolvedShortcuts";

interface ShortcutProviderProps {
  children: ReactNode;
  /** Injectable for tests; production uses the app-wide singleton. */
  registry?: CommandRegistry;
}

/**
 * The single owner of global keyboard input (M4, ADR-015 — previously an
 * if-chain inside EngineCanvas). Every keydown passes three tiers in order:
 *
 * 1. Suppression — keystrokes in editable targets, and everything while a
 *    modal (palette / recorder) is open. Modals own their keys via React
 *    Aria; leaking Escape to the worker mid-dialog would deselect on close.
 * 2. Gestures — raw input, not commands. Space-hold pan is held-key modal
 *    state on the store; Escape forwards to the worker modifier-agnostically
 *    because it cancels an in-flight creation drag, and a stray Shift held
 *    during that drag must not swallow the cancel.
 * 3. Commands — the event's chord is looked up in the resolved map and
 *    dispatched through the registry. `preventDefault` fires only on a hit,
 *    so unbound browser chords keep their native behaviour.
 *
 * Key-repeat dispatches again on purpose, matching the M3 listener (holding
 * Delete kept deleting through the old raw-forwarding path). The `blur`
 * release is new: losing window focus with Space held never delivers the
 * keyup, and M3 came back from Alt-Tab stuck in temporary-pan.
 */
export function ShortcutProvider({ children, registry = commandRegistry }: ShortcutProviderProps) {
  const ctx = useCommandContext();
  const resolved = useResolvedShortcuts(registry);
  const { sendKeyDown } = useEngineContext();
  const setSpaceDown = useUIStore((s) => s.setSpaceDown);
  const spaceDownRef = useRef(false);
  const platform = useMemo(() => detectChordPlatform(), []);

  useEffect(() => {
    const releaseSpace = (): void => {
      if (spaceDownRef.current) {
        spaceDownRef.current = false;
        setSpaceDown(false);
      }
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (isEditableTarget(e.target)) return;
      const { paletteOpen, shortcutRecorderOpen } = useUIStore.getState();
      if (paletteOpen || shortcutRecorderOpen) return;

      if (e.key === " ") {
        e.preventDefault();
        if (!spaceDownRef.current) {
          spaceDownRef.current = true;
          setSpaceDown(true);
        }
        return;
      }

      if (e.key === "Escape") {
        sendKeyDown("Escape", {
          shift: e.shiftKey,
          ctrl: e.ctrlKey,
          alt: e.altKey,
          meta: e.metaKey,
        });
        return;
      }

      const chord = chordFromEvent(e, platform);
      if (chord === null) return;
      const commandId = resolved.byChord.get(chord);
      if (commandId === undefined) return;
      e.preventDefault();
      registry.execute(commandId, ctx);
    };

    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === " ") releaseSpace();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseSpace);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseSpace);
    };
  }, [ctx, resolved, registry, sendKeyDown, setSpaceDown, platform]);

  return <>{children}</>;
}
