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
import type { EngineToMainMessage, MainToEngineMessage } from "@graphite/protocol";
import { FRAME_BUDGET_MS, TARGET_FPS } from "@graphite/protocol";

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
