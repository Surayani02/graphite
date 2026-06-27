/**
 * Phase 0 benchmark — establishes the baseline for ID generation throughput.
 *
 * Why bench this first?  `createNodeId()` is called on EVERY object added
 * to the document. At 100 000 objects, slow ID generation is measurable.
 * crypto.randomUUID() should be >1M ops/sec on any modern CPU.
 */
import { bench, describe } from "vitest";
import { createNodeId, createDocumentId } from "../index";

describe("ID generation", () => {
  bench("createNodeId × 1", () => {
    createNodeId();
  });

  bench("createDocumentId × 1", () => {
    createDocumentId();
  });

  bench("createNodeId × 1 000", () => {
    for (let i = 0; i < 1_000; i++) {
      createNodeId();
    }
  });

  bench("createNodeId × 10 000", () => {
    for (let i = 0; i < 10_000; i++) {
      createNodeId();
    }
  });
});
