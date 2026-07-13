/**
 * Phase 7 M2 benchmarks — .graphite serialise/parse at MVP scale.
 *
 * Run with: pnpm bench
 * Targets (Phase 7 blueprint):
 *   save path  — serializeGraphiteFile of a 10 000-node document  < 500 ms
 *   load path  — parseGraphiteFile incl. full validation          < 1 000 ms
 *
 * Both are single-shot user actions (mod+S / mod+O), never per-frame; the
 * ceilings are the blueprint's UX budgets, not micro-targets. Measured
 * means land in tens of milliseconds — JSON plus one validation pass over
 * 10k nodes — recorded in the M2 delivery report.
 */
import { bench, describe } from "vitest";
import type { Color } from "@graphite/protocol";
import { DocumentModel } from "../document/model";
import { parseGraphiteFile, serializeGraphiteFile } from "../features/files/format";

const FILL: Color = { r: 99, g: 179, b: 237, a: 255 };

function buildDocJson(n: number): string {
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
  return doc.serialize();
}

describe(".graphite at 10 000 nodes", () => {
  const documentJson = buildDocJson(10_000);
  const fileText = serializeGraphiteFile(documentJson);

  bench("serializeGraphiteFile (save path)", () => {
    serializeGraphiteFile(documentJson);
  });

  bench("parseGraphiteFile incl. validation (load path)", () => {
    parseGraphiteFile(fileText);
  });
});
