import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_TEXTURE_DIM, clampCanvasSize } from "../workers/engine/gpu/context";

/**
 * M5-FR1 — the swap-chain size guard.
 *
 * The layout root cause (AppShell's implicit auto row) is a CSS fix that
 * jsdom cannot exercise; its verification is the browser re-test and the
 * E2E suite. What *is* unit-provable is the worker-side guard that turns
 * any future layout regression into a clamped-but-alive canvas: exact
 * pass-through inside the allocatable range, independent per-axis
 * clamping at the device ceiling, a floor of 1 (a zero-height canvas
 * during a layout collapse is as fatal to `getCurrentTexture` as an
 * oversized one), and an honest `clamped` flag driving the warning.
 */
describe("clampCanvasSize", () => {
  it("passes valid sizes through untouched", () => {
    expect(clampCanvasSize(562, 754, 8192)).toEqual({ width: 562, height: 754, clamped: false });
  });

  it("passes the exact ceiling through — the limit is inclusive", () => {
    expect(clampCanvasSize(8192, 8192, 8192)).toEqual({
      width: 8192,
      height: 8192,
      clamped: false,
    });
  });

  it("clamps each axis independently at the device ceiling", () => {
    // The observed failure: 562 × 300,055 on a dpr-1.25 Windows machine.
    expect(clampCanvasSize(562, 300_055, 8192)).toEqual({
      width: 562,
      height: 8192,
      clamped: true,
    });
    expect(clampCanvasSize(300_055, 562, 8192)).toEqual({
      width: 8192,
      height: 562,
      clamped: true,
    });
  });

  it("floors both axes at 1 — a zero-sized swap-chain is invalid too", () => {
    expect(clampCanvasSize(0, 0, 8192)).toEqual({ width: 1, height: 1, clamped: true });
    expect(clampCanvasSize(-4, 300, 8192)).toEqual({ width: 1, height: 300, clamped: true });
  });

  it("rounds fractional sizes without flagging them — rounding is not clamping", () => {
    // bridge.resize rounds before posting, but the guard stays safe for
    // any caller: nearest-integer honouring, no "layout bug" warning.
    expect(clampCanvasSize(562.4, 754.6, 8192)).toEqual({
      width: 562,
      height: 755,
      clamped: false,
    });
  });

  it("exposes the spec-default ceiling for the pre-device window", () => {
    expect(DEFAULT_MAX_TEXTURE_DIM).toBe(8192);
  });
});
