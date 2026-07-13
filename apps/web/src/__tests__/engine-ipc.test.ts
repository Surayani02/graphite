/**
 * Phase 1 — IPC message contract tests.
 *
 * Validates the structure and typing of every message that crosses the
 * main-thread / worker boundary.  All tests run in Node.js via Vitest.
 *
 * Deliberately does NOT test Worker instantiation or rendering —
 * those require a real GPU and are covered by the Phase 6 E2E suite.
 */

import { describe, expect, it } from "vitest";
import type {
  DocumentOp,
  EngineToMainMessage,
  HistoryStatus,
  MainToEngineMessage,
} from "@graphite/protocol";
import { FRAME_BUDGET_MS, TARGET_FPS, createNodeId } from "@graphite/protocol";

// ─── Main → Engine ───────────────────────────────────────────────────────────

describe("MainToEngineMessage", () => {
  it("engine:resize encodes physical pixel dimensions", () => {
    const cssW = 1920,
      cssH = 1080,
      dpr = 2;
    const msg: MainToEngineMessage = {
      type: "engine:resize",
      width: Math.round(cssW * dpr),
      height: Math.round(cssH * dpr),
      devicePixelRatio: dpr,
    };
    expect(msg.width).toBe(3840);
    expect(msg.height).toBe(2160);
    expect(msg.devicePixelRatio).toBe(2);
  });

  it("engine:resize dimensions are always integers", () => {
    // fractional CSS pixels must be rounded, never float
    const msg: MainToEngineMessage = {
      type: "engine:resize",
      width: Math.round(733.7 * 1.5),
      height: Math.round(400.3 * 1.5),
      devicePixelRatio: 1.5,
    };
    expect(Number.isInteger(msg.width)).toBe(true);
    expect(Number.isInteger(msg.height)).toBe(true);
  });

  it("tool:set accepts every defined tool type", () => {
    const tools = ["select", "pan", "rectangle", "ellipse", "text", "pen"] as const;
    for (const tool of tools) {
      const msg: MainToEngineMessage = { type: "tool:set", tool };
      expect(msg.tool).toBe(tool);
    }
  });

  it("pointer:move carries canvas coordinates and all modifier flags", () => {
    const msg: MainToEngineMessage = {
      type: "pointer:move",
      x: 400.5,
      y: 300.5,
      modifiers: { shift: true, ctrl: false, alt: false, meta: false },
    };
    expect(msg.x).toBe(400.5);
    expect(msg.modifiers.shift).toBe(true);
    expect(msg.modifiers.ctrl).toBe(false);
  });

  it("wheel:scroll carries signed delta values", () => {
    const msg: MainToEngineMessage = {
      type: "wheel:scroll",
      deltaX: 0,
      deltaY: -120,
      x: 512,
      y: 384,
      modifiers: { shift: false, ctrl: true, alt: false, meta: false },
    };
    expect(msg.deltaY).toBe(-120);
    expect(msg.modifiers.ctrl).toBe(true);
  });

  it("key:down carries the key string and modifiers", () => {
    const msg: MainToEngineMessage = {
      type: "key:down",
      key: "z",
      modifiers: { shift: false, ctrl: true, alt: false, meta: false },
    };
    expect(msg.key).toBe("z");
  });
});

// ─── Engine → Main ───────────────────────────────────────────────────────────

describe("EngineToMainMessage", () => {
  it("engine:ready has no extra fields", () => {
    const msg: EngineToMainMessage = { type: "engine:ready" };
    expect(msg.type).toBe("engine:ready");
    expect(Object.keys(msg)).toHaveLength(1);
  });

  it("frame:rendered carries non-negative timing values", () => {
    const msg: EngineToMainMessage = {
      type: "frame:rendered",
      frameNumber: 1,
      timestamp: 16.7,
      renderTimeMs: 3.2,
    };
    expect(msg.frameNumber).toBeGreaterThan(0);
    expect(msg.renderTimeMs).toBeGreaterThanOrEqual(0);
    expect(msg.timestamp).toBeGreaterThan(0);
  });

  it("frame:rendered frameNumber is monotonically increasing", () => {
    // Test the numeric invariant directly — no array-of-union indexing needed.
    const frameNumbers = [1, 2, 3, 60, 3_600];
    for (let i = 1; i < frameNumbers.length; i++) {
      const prev = frameNumbers[i - 1];
      const curr = frameNumbers[i];
      if (prev !== undefined && curr !== undefined) {
        expect(curr).toBeGreaterThan(prev);
      }
    }
  });

  it("engine:error requires a non-empty message string", () => {
    const msg: EngineToMainMessage = {
      type: "engine:error",
      message: "No WebGPU adapter found.",
    };
    expect(msg.message.length).toBeGreaterThan(0);
  });

  it("engine:error may carry an optional stack trace", () => {
    const withStack: EngineToMainMessage = {
      type: "engine:error",
      message: "Shader compile error",
      stack: "Error: Shader compile error\n  at buildPipeline (engine.worker.ts:88)",
    };
    expect(withStack.stack).toContain("buildPipeline");

    // Without stack is also valid
    const withoutStack: EngineToMainMessage = {
      type: "engine:error",
      message: "Device lost",
    };
    expect(withoutStack.type).toBe("engine:error");
  });

  it("viewport:changed carries zoom level", () => {
    const msg: EngineToMainMessage = {
      type: "viewport:changed",
      x: -200,
      y: -100,
      zoom: 1.5,
    };
    expect(msg.zoom).toBe(1.5);
  });
});

// ─── Frame budget arithmetic ─────────────────────────────────────────────────

describe("Frame budget", () => {
  it("FRAME_BUDGET_MS equals 1000 / TARGET_FPS", () => {
    expect(FRAME_BUDGET_MS).toBeCloseTo(1000 / TARGET_FPS, 6);
  });

  it("FRAME_BUDGET_MS is approximately 16.67 ms at 60 fps", () => {
    expect(FRAME_BUDGET_MS).toBeCloseTo(16.67, 1);
  });

  it("remaining budget after a 4 ms render is positive", () => {
    const remaining = FRAME_BUDGET_MS - 4;
    expect(remaining).toBeGreaterThan(0);
  });

  it("a render exceeding the budget yields a non-negative delay of 0", () => {
    const overBudgetRenderMs = FRAME_BUDGET_MS + 5;
    const delay = Math.max(0, FRAME_BUDGET_MS - overBudgetRenderMs);
    expect(delay).toBe(0);
  });
});

describe("Phase 4 viewport message", () => {
  it("viewport:changed has x, y and zoom fields", () => {
    const msg: EngineToMainMessage = {
      type: "viewport:changed",
      x: 375,
      y: 315,
      zoom: 1.5,
    };
    expect(msg.zoom).toBe(1.5);
    expect(msg.x).toBe(375);
  });

  it("zoom pan arithmetic: scroll 100px at zoom 2 → 50 world units", () => {
    const zoom = 2.0;
    const deltaY = 100;
    const worldPan = deltaY / zoom;
    expect(worldPan).toBe(50);
  });

  it("zoom-on-cursor formula keeps world point fixed", () => {
    // Camera at (100, 50), zoom 1, viewport 800×600.
    // Pivot cursor at physical (200, 150) — deliberately OFF-CENTER
    // (viewport center would be 400,300). An earlier version of this test
    // used a centered pivot, which makes (pivotPhys - vp/2) zero on both
    // axes — the camera mathematically can't move in that case regardless
    // of zoom, which made the test pass for the wrong reason while also
    // asserting an arithmetically incorrect expected value. An off-center
    // pivot actually exercises camera movement.
    const camX = 100,
      camY = 50,
      zoom = 1;
    const vpW = 800,
      vpH = 600;
    const pivotPhysX = 200,
      pivotPhysY = 150;

    // pivotWorldX = (200 - 400)/1 + 100 = -100
    // pivotWorldY = (150 - 300)/1 +  50 = -100
    const pivotWorldX = (pivotPhysX - vpW / 2) / zoom + camX;
    const pivotWorldY = (pivotPhysY - vpH / 2) / zoom + camY;

    const newZoom = 2.0;
    // newCamX = -100 - (200-400)/2 = -100 - (-100) =   0
    // newCamY = -100 - (150-300)/2 = -100 - ( -75) = -25
    const newCamX = pivotWorldX - (pivotPhysX - vpW / 2) / newZoom;
    const newCamY = pivotWorldY - (pivotPhysY - vpH / 2) / newZoom;

    // Recompute the pivot's world position under the new camera/zoom —
    // this is the actual invariant zoom-on-cursor must satisfy.
    const newWorldX = (pivotPhysX - vpW / 2) / newZoom + newCamX;
    const newWorldY = (pivotPhysY - vpH / 2) / newZoom + newCamY;

    expect(newWorldX).toBeCloseTo(pivotWorldX, 5); // pivot world X unchanged
    expect(newWorldY).toBeCloseTo(pivotWorldY, 5); // pivot world Y unchanged

    // Hand-verified expected camera position (see comments above) —
    // catches a class of bug where the invariant above could accidentally
    // hold while the formula is still wrong.
    expect(newCamX).toBeCloseTo(0, 5);
    expect(newCamY).toBeCloseTo(-25, 5);
  });
});

// ─── Phase 5: Document IPC messages ──────────────────────────────────────────

describe("Document IPC messages — Main → Engine", () => {
  it("document:load carries a json string", () => {
    const msg: MainToEngineMessage = {
      type: "document:load",
      json: '{"version":1,"name":"Test","nodes":[]}',
    };
    expect(msg.type).toBe("document:load");
    expect(typeof msg.json).toBe("string");
  });

  it("document:new has exactly one key", () => {
    const msg: MainToEngineMessage = { type: "document:new" };
    expect(Object.keys(msg)).toHaveLength(1);
  });

  it("document:request_save has exactly one key", () => {
    const msg: MainToEngineMessage = { type: "document:request_save" };
    expect(Object.keys(msg)).toHaveLength(1);
  });
});

describe("Document IPC messages — Engine → Main", () => {
  it("document:state carries a json string", () => {
    const msg: EngineToMainMessage = {
      type: "document:state",
      json: '{"version":2,"name":"Demo","nodes":[]}',
    };
    expect(msg.type).toBe("document:state");
    expect(typeof msg.json).toBe("string");
  });
});

// ─── Phase 6 Milestone 2: Layers / Inspector IPC messages ────────────────────

describe("Document IPC messages — Phase 6 Milestone 2", () => {
  it("document:nodes carries the full node list", () => {
    const msg: EngineToMainMessage = {
      type: "document:nodes",
      nodes: [
        {
          id: "f1",
          kind: "frame",
          name: "Frame",
          x: 0,
          y: 0,
          w: 800,
          h: 600,
          fill: { r: 0, g: 0, b: 0, a: 0 },
          stroke: null,
          cornerRadius: 0,
          parent: null,
          children: ["r1"],
        },
      ],
    };
    expect(msg.nodes).toHaveLength(1);
    expect(msg.nodes[0]?.kind).toBe("frame");
  });

  it("document:nodes accepts an empty list", () => {
    const msg: EngineToMainMessage = { type: "document:nodes", nodes: [] };
    expect(msg.nodes).toHaveLength(0);
  });

  it("selection:set carries zero or more node ids", () => {
    const empty: MainToEngineMessage = { type: "selection:set", nodeIds: [] };
    const one: MainToEngineMessage = {
      type: "selection:set",
      nodeIds: [createNodeId()],
    };
    expect(empty.nodeIds).toHaveLength(0);
    expect(one.nodeIds).toHaveLength(1);
  });

  it("node:update carries a partial patch", () => {
    const msg: MainToEngineMessage = {
      type: "node:update",
      nodeId: "r1",
      patch: { w: 100, h: 50 },
    };
    expect(msg.patch).toEqual({ w: 100, h: 50 });
  });

  it("node:update's stroke field distinguishes 'unset' from 'clear'", () => {
    const unset: MainToEngineMessage = { type: "node:update", nodeId: "r1", patch: { x: 1 } };
    const cleared: MainToEngineMessage = {
      type: "node:update",
      nodeId: "r1",
      patch: { stroke: null },
    };
    expect(unset.patch.stroke).toBeUndefined();
    expect(cleared.patch.stroke).toBeNull();
  });
});

// ─── Phase 7 Milestone 1 — history ───────────────────────────────────────────

describe("history messages (Phase 7 M1)", () => {
  it("history:undo / history:redo are bare intents", () => {
    const undo: MainToEngineMessage = { type: "history:undo" };
    const redo: MainToEngineMessage = { type: "history:redo" };
    expect(Object.keys(undo)).toHaveLength(1);
    expect(Object.keys(redo)).toHaveLength(1);
  });

  it("history:state carries a full status snapshot", () => {
    const status: HistoryStatus = {
      canUndo: true,
      canRedo: false,
      undoLabel: "Move Rectangle",
      redoLabel: null,
      dirty: true,
    };
    const msg: EngineToMainMessage = { type: "history:state", status };
    expect(msg.status.undoLabel).toBe("Move Rectangle");
    expect(msg.status.dirty).toBe(true);
  });

  it("history:state's announce is optional and names the action", () => {
    const bare: EngineToMainMessage = {
      type: "history:state",
      status: {
        canUndo: false,
        canRedo: true,
        undoLabel: null,
        redoLabel: "Undo me",
        dirty: false,
      },
    };
    const announced: EngineToMainMessage = {
      type: "history:state",
      status: {
        canUndo: false,
        canRedo: true,
        undoLabel: null,
        redoLabel: "Undo me",
        dirty: false,
      },
      announce: { action: "undo", label: "Undo me" },
    };
    expect(bare.announce).toBeUndefined();
    expect(announced.announce?.action).toBe("undo");
  });

  it("every DocumentOp shape survives a JSON round-trip (ops are wire material)", () => {
    const ops: DocumentOp[] = [
      {
        op: "node:create",
        node: {
          id: "n1",
          kind: "rect",
          name: "Rectangle",
          x: 1,
          y: 2,
          w: 3,
          h: 4,
          fill: { r: 9, g: 8, b: 7, a: 255 },
          stroke: null,
          cornerRadius: 0,
          parent: "f1",
          children: [],
        },
        childIndex: 0,
        orderIndex: 1,
      },
      { op: "node:remove", nodeId: "n1" },
      { op: "node:set-props", nodeId: "n1", patch: { x: 10, stroke: null } },
    ];
    for (const op of ops) {
      expect(JSON.parse(JSON.stringify(op))).toEqual(op);
    }
  });
});
