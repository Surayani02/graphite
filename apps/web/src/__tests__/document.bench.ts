/**
 * Phase 5 benchmarks — DocumentModel serialisation.
 *
 * Run with: pnpm bench  (in apps/web or from the repo root via Turborepo)
 * Targets:  serialize 1 000 nodes < 10 ms, fromJson 1 000 nodes < 15 ms
 */
import { bench, describe } from "vitest";
import { DocumentModel } from "../document/model";
import type { Color } from "@graphite/protocol";

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
      if (i % 3 === 1) doc.setCornerRadius(id, 12);
    }
  }
  return doc;
}

describe("DocumentModel::serialize", () => {
  bench("100 nodes", () => {
    buildDoc(100).serialize();
  });
  bench("1 000 nodes", () => {
    buildDoc(1_000).serialize();
  });
});

describe("DocumentModel::fromJson", () => {
  const j100 = buildDoc(100).serialize();
  const j1000 = buildDoc(1_000).serialize();

  bench("100 nodes", () => {
    DocumentModel.fromJson(j100);
  });
  bench("1 000 nodes", () => {
    DocumentModel.fromJson(j1000);
  });
});

describe("DocumentModel::setNodePosition", () => {
  bench("1 000 calls", () => {
    const doc = buildDoc(10);
    for (let i = 0; i < 1_000; i++) {
      doc.setNodePosition(`node-${String(i % 10)}`, i, i);
    }
  });
});
