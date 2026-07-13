/**
 * workers/engine/history.ts unit tests — stack behaviour, the eviction
 * cap, and sequence-based dirty tracking (including the evicted-save-point
 * case that index-based tracking gets wrong).
 */
import { describe, expect, it } from "vitest";
import { History, HISTORY_LIMIT, type HistoryEntry } from "../workers/engine/history";

function entry(label: string): HistoryEntry {
  return {
    label,
    forward: [{ op: "node:set-props", nodeId: "n1", patch: { x: 1 } }],
    inverse: [{ op: "node:set-props", nodeId: "n1", patch: { x: 0 } }],
    selectionBefore: ["n1"],
    selectionAfter: ["n1"],
  };
}

describe("History — stack behaviour", () => {
  it("starts empty, clean, and label-less", () => {
    const h = new History();
    expect(h.status()).toEqual({
      canUndo: false,
      canRedo: false,
      undoLabel: null,
      redoLabel: null,
      dirty: false,
    });
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();
  });

  it("push → undo → redo moves entries between stacks with labels intact", () => {
    const h = new History();
    h.push(entry("Move Rectangle"));
    expect(h.status()).toMatchObject({ canUndo: true, undoLabel: "Move Rectangle" });

    const undone = h.undo();
    expect(undone?.label).toBe("Move Rectangle");
    expect(h.status()).toMatchObject({
      canUndo: false,
      canRedo: true,
      redoLabel: "Move Rectangle",
    });

    const redone = h.redo();
    expect(redone?.label).toBe("Move Rectangle");
    expect(h.status()).toMatchObject({ canUndo: true, canRedo: false });
  });

  it("pushing after undo discards the redo future (linear history)", () => {
    const h = new History();
    h.push(entry("A"));
    h.push(entry("B"));
    h.undo();
    expect(h.status().canRedo).toBe(true);
    h.push(entry("C"));
    expect(h.status()).toMatchObject({ canRedo: false, undoLabel: "C" });
  });

  it("evicts the oldest entry past HISTORY_LIMIT", () => {
    const h = new History();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) h.push(entry(`e${String(i)}`));

    let undone = 0;
    while (h.undo() !== null) undone += 1;
    expect(undone).toBe(HISTORY_LIMIT);
  });

  it("clear drops both stacks and resets dirty", () => {
    const h = new History();
    h.push(entry("A"));
    h.undo();
    h.clear();
    expect(h.status()).toEqual({
      canUndo: false,
      canRedo: false,
      undoLabel: null,
      redoLabel: null,
      dirty: false,
    });
  });
});

describe("History — dirty tracking", () => {
  it("push dirties; markSaved cleans; undo re-dirties; redo re-cleans", () => {
    const h = new History();
    expect(h.status().dirty).toBe(false);

    h.push(entry("A"));
    expect(h.status().dirty).toBe(true);

    h.markSaved();
    expect(h.status().dirty).toBe(false);

    h.undo();
    expect(h.status().dirty).toBe(true);

    h.redo();
    expect(h.status().dirty).toBe(false);
  });

  it("saving mid-stack: clean exactly at the saved position", () => {
    const h = new History();
    h.push(entry("A"));
    h.push(entry("B"));
    h.undo(); // at A
    h.markSaved();
    expect(h.status().dirty).toBe(false);

    h.redo(); // at B — beyond the save point
    expect(h.status().dirty).toBe(true);

    h.undo(); // back at A
    expect(h.status().dirty).toBe(false);

    h.undo(); // at pristine — before the save point
    expect(h.status().dirty).toBe(true);
  });

  it("stays dirty forever once the saved position is evicted", () => {
    const h = new History();
    // Saved at pristine (seq 0), then push past the cap so seq 0 becomes
    // unreachable: floorSeq rises above savedSeq.
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) h.push(entry(`e${String(i)}`));

    while (h.undo() !== null) {
      /* unwind everything that's left */
    }
    expect(h.status().canUndo).toBe(false);
    expect(h.status().dirty).toBe(true);
  });
});
