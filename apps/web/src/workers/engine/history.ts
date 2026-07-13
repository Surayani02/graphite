/**
 * History — Phase 7 Milestone 1.
 *
 * A pure, bounded undo/redo stack of `HistoryEntry` records. Deliberately
 * knows nothing about `EngineState`, the SceneGraph, or IPC: it stores and
 * sequences entries; `scene/apply.ts` owns applying them. That split keeps
 * this class trivially unit-testable and keeps exactly one module
 * responsible for how ops touch the document and engine.
 *
 * Dirty tracking uses monotonic sequence numbers rather than stack indices:
 * every `push` stamps a fresh sequence, `currentSeq` follows the top of the
 * undo stack (or `floorSeq` when it's empty), and the document is dirty
 * whenever `currentSeq !== savedSeq`. Sequence numbers survive eviction —
 * once the entry that was current at save time falls off the bottom of a
 * full stack, no amount of undoing can reach the saved state again, and the
 * arithmetic reports permanently-dirty-until-next-save with no special case.
 */

import type { DocumentOp, HistoryStatus } from "@graphite/protocol";

/**
 * Maximum retained undo entries. Entries are small (ops hold one node
 * snapshot at most), so 100 costs well under a megabyte even for paranoid
 * cases, while covering far more steps than users track mentally. Oldest
 * entries are evicted silently.
 */
export const HISTORY_LIMIT = 100;

/** One user-level edit: "the ops that made it" + "the ops that unmake it". */
export interface HistoryEntry {
  /** Human-readable, palette/announcement-facing — "Move Rectangle". */
  readonly label: string;
  /** Applied in array order on redo. */
  readonly forward: readonly DocumentOp[];
  /** Applied in array order on undo — already reversed relative to forward. */
  readonly inverse: readonly DocumentOp[];
  /** Node UUIDs selected before/after the edit, restored on undo/redo. */
  readonly selectionBefore: readonly string[];
  readonly selectionAfter: readonly string[];
}

interface StoredEntry {
  readonly entry: HistoryEntry;
  readonly seq: number;
}

export class History {
  private undoStack: StoredEntry[] = [];
  private redoStack: StoredEntry[] = [];
  private seqCounter = 0;
  /** Sequence of the entry the document currently reflects (0 = pristine). */
  private currentSeq = 0;
  /** `currentSeq` at the moment of the last save. */
  private savedSeq = 0;
  /** Sequence represented by "below the bottom of the stack" after eviction. */
  private floorSeq = 0;

  /** Records a completed edit. Clears the redo stack — the universal
   *  linear-history convention: editing after undo discards the future. */
  push(entry: HistoryEntry): void {
    this.seqCounter += 1;
    this.undoStack.push({ entry, seq: this.seqCounter });
    this.currentSeq = this.seqCounter;
    this.redoStack = [];

    if (this.undoStack.length > HISTORY_LIMIT) {
      const evicted = this.undoStack.shift();
      if (evicted !== undefined) this.floorSeq = evicted.seq;
    }
  }

  /** Pops the entry to revert, or `null` if there is nothing to undo.
   *  The caller applies `entry.inverse`; the entry becomes redoable. */
  undo(): HistoryEntry | null {
    const top = this.undoStack.pop();
    if (top === undefined) return null;
    this.redoStack.push(top);
    const newTop = this.undoStack[this.undoStack.length - 1];
    this.currentSeq = newTop !== undefined ? newTop.seq : this.floorSeq;
    return top.entry;
  }

  /** Pops the entry to re-apply, or `null` if there is nothing to redo. */
  redo(): HistoryEntry | null {
    const top = this.redoStack.pop();
    if (top === undefined) return null;
    this.undoStack.push(top);
    this.currentSeq = top.seq;
    return top.entry;
  }

  /** Drops everything — document:new / document:load start a fresh,
   *  clean timeline. */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.seqCounter = 0;
    this.currentSeq = 0;
    this.savedSeq = 0;
    this.floorSeq = 0;
  }

  /** Marks the current position as the saved state (`dirty` → false). */
  markSaved(): void {
    this.savedSeq = this.currentSeq;
  }

  status(): HistoryStatus {
    const undoTop = this.undoStack[this.undoStack.length - 1];
    const redoTop = this.redoStack[this.redoStack.length - 1];
    return {
      canUndo: undoTop !== undefined,
      canRedo: redoTop !== undefined,
      undoLabel: undoTop !== undefined ? undoTop.entry.label : null,
      redoLabel: redoTop !== undefined ? redoTop.entry.label : null,
      dirty: this.currentSeq !== this.savedSeq,
    };
  }
}
