import { type HistoryStatus, type NodePatch, type ToolType } from "@graphite/protocol";
import { type EngineStatus } from "../../hooks/useEngine";

/**
 * Stable, namespaced command identifier — `"<area>.<action>"`, e.g.
 * `"tool.rectangle"` or `"file.save"`. Ids are public API the moment they
 * ship: persisted shortcut overrides key on them, and the Phase 10 plugin
 * system will address them — rename one and every user keymap breaks.
 */
export type CommandId = `${string}.${string}`;

/** Palette grouping + future Settings-page grouping. */
export type CommandCategory = "Tools" | "Edit" | "File" | "View" | "Help";

/**
 * The capability surface a command may touch, assembled at dispatch time by
 * `useCommandContext()`. Deliberately narrow: commands express *user
 * intent*, so they get the same two legal state surfaces panels do —
 * engine actions (EngineContext senders, ADR-013 §6) and UI-intent setters
 * (Zustand) — never raw worker/bridge access.
 */
export interface CommandContext {
  readonly engine: {
    /** Snapshot of the canvas selection at dispatch time. */
    readonly selectedIds: readonly string[];
    /** At least one node exists (Phase 7 M4) — export gates on it: an
     *  empty document has nothing to serialise. */
    readonly hasContent: boolean;
    readonly setSelection: (nodeIds: readonly string[]) => void;
    readonly deleteSelection: () => void;
    /** Engine lifecycle — file commands gate on "running": there is no
     *  document to serialise (or load into) before the worker is up
     *  (Phase 7 M2). */
    readonly status: EngineStatus;
    readonly updateNode: (nodeId: string, patch: NodePatch) => void;
    /** Undo/redo availability at dispatch time — drives `enabled` gates
     *  the same way `selectedIds` gates deletion (Phase 7 M1). */
    readonly historyStatus: HistoryStatus;
    readonly undo: () => void;
    readonly redo: () => void;
  };
  /** File actions (Phase 7 M2) — fire-and-forget; FilesProvider owns the
   *  async flow, pickers, discard guard, and error surfacing. */
  readonly files: {
    readonly save: () => void;
    readonly saveAs: () => void;
    readonly open: () => void;
    readonly newDocument: () => void;
  };
  /** Export actions (Phase 7 M4) — fire-and-forget like `files.*`;
   *  serialization and the gateway handoff live in `features/export`. */
  readonly exports: {
    /** Opens the export dialog (Phase 7 M4) — format/scale/quality choice
     *  lives there; the actual serialize/readback runs on confirm. */
    readonly open: () => void;
  };
  readonly ui: {
    readonly setActiveTool: (tool: ToolType) => void;
    readonly toggleLeftPanel: () => void;
    readonly toggleInspector: () => void;
    readonly openPalette: () => void;
    readonly setLeftPanelTab: (tab: "layers" | "assets") => void;
    readonly openShortcutRecorder: (target?: CommandId) => void;
  };
}

/**
 * One executable command — the single source of truth both the palette and
 * the shortcut system derive from (ADR-015).
 */
export interface CommandDescriptor {
  readonly id: CommandId;
  /** Imperative, palette-facing title — "Delete Selection", not "Deletes…". */
  readonly title: string;
  readonly category: CommandCategory;
  /** Extra search terms; keyword matches rank below title matches. */
  readonly keywords?: readonly string[];
  /**
   * Raw default chords ("mod+s", "delete"), normalized at resolve time by
   * `features/shortcuts`. Several defaults may alias one command (Delete +
   * Backspace); the first entry is the display chord. A user override
   * replaces the whole list.
   */
  readonly defaultChords?: readonly string[];
  /**
   * When present and false at dispatch time, the command neither runs nor
   * appears in the palette. Omit for always-available commands.
   */
  readonly enabled?: (ctx: CommandContext) => boolean;
  readonly run: (ctx: CommandContext) => void;
}
