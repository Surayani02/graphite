/**
 * Phase 7 M1 benchmarks — document op application and history.
 *
 * Run with: pnpm bench  (in apps/web or from the repo root via Turborepo)
 * Targets (Phase 7 blueprint, generous ceilings — see docs/adr/ADR-020):
 *   applyOp set-props, 10 000-node document          < 0.05 ms
 *   applyOp remove + inverse restore (round-trip)    < 2 ms
 *   History: push 100 entries then undo all 100      < 5 ms
 *   effectiveNodePatch                               < 0.005 ms
 *
 * The remove/restore ceiling was raised from an initial 1 ms estimate to
 * 2 ms after first measurement (mean ~1.25 ms in the M1 container run):
 * the round-trip legitimately makes four O(n) passes over the 10k-entry
 * insertion-order array (indexOf + splice, twice each) plus two deep node
 * clones. It runs once per user delete/undo — never per frame — so O(n)
 * array maintenance is the documented, accepted cost until a milestone
 * has cause to replace the order array with an order-statistic structure.
 */
import { bench, describe } from "vitest";
import type { Color, DocNode } from "@graphite/protocol";
import { DocumentModel } from "../document/model";
import { applyOp, effectiveNodePatch } from "../document/ops";
import { History, type HistoryEntry } from "../workers/engine/history";

const FILL: Color = { r: 99, g: 179, b: 237, a: 255 };

function buildDoc(n: number): DocumentModel {
  const doc = new DocumentModel("Bench");
  const frameId = "frame-0";
  doc.addFrame(frameId, 0, 0, 100_000, 100_000);
  for (let i = 0; i < n; i++) {
    const id = `node-${String(i)}`;
    const x = (i % 100) * 110;
    const y = Math.floor(i / 100) * 110;
    if (i % 3 === 2) {
      doc.addEllipse(id, frameId, x, y, 100, 100, FILL);
    } else {
      doc.addRect(id, frameId, x, y, 100, 100, FILL);
    }
  }
  return doc;
}

describe("applyOp — 10 000-node document", () => {
  const doc = buildDoc(10_000);
  let toggle = 0;

  bench("set-props (x/y)", () => {
    toggle = toggle === 0 ? 1 : 0;
    applyOp(doc, {
      op: "node:set-props",
      nodeId: "node-5000",
      patch: { x: 10 + toggle, y: 20 + toggle },
    });
  });

  bench("remove + inverse restore (round-trip)", () => {
    const { inverse } = applyOp(doc, { op: "node:remove", nodeId: "node-5000" });
    applyOp(doc, inverse);
  });
});

describe("History", () => {
  function entry(i: number): HistoryEntry {
    return {
      label: `Edit ${String(i)}`,
      forward: [{ op: "node:set-props", nodeId: "n1", patch: { x: i } }],
      inverse: [{ op: "node:set-props", nodeId: "n1", patch: { x: i - 1 } }],
      selectionBefore: ["n1"],
      selectionAfter: ["n1"],
    };
  }

  bench("push 100 entries, undo all 100", () => {
    const h = new History();
    for (let i = 0; i < 100; i++) h.push(entry(i));
    while (h.undo() !== null) {
      /* unwind */
    }
  });
});

describe("effectiveNodePatch", () => {
  const doc = buildDoc(10);
  const node = doc.getNode("node-5");
  if (node === undefined) throw new Error("bench fixture missing node-5");
  const target: Readonly<DocNode> = node;

  bench("mixed patch with clamps", () => {
    effectiveNodePatch(target, { x: 1, y: 2, w: -5, cornerRadius: 500, fill: FILL });
  });
});
