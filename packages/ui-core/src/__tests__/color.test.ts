/**
 * colorToHex / hexToColor unit tests.
 */
import { describe, expect, it } from "vitest";
import { colorToHex, hexToColor } from "../color";

describe("colorToHex", () => {
  it("formats channels as padded lowercase hex", () => {
    expect(colorToHex({ r: 22, g: 119, b: 255, a: 255 })).toBe("#1677ff");
  });

  it("clamps out-of-range channels", () => {
    expect(colorToHex({ r: -10, g: 300, b: 0, a: 255 })).toBe("#00ff00");
  });
});

describe("hexToColor", () => {
  it("parses a 6-digit hex with alpha", () => {
    expect(hexToColor("#1677ff", 128)).toEqual({ r: 22, g: 119, b: 255, a: 128 });
  });

  it("accepts hex without the leading #", () => {
    expect(hexToColor("ff0000", 255)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
  });

  it("expands 3-digit CSS shorthand per the doubling rule", () => {
    expect(hexToColor("#fff", 255)).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    expect(hexToColor("#f80", 255)).toEqual({ r: 255, g: 136, b: 0, a: 255 });
  });

  it("returns null for malformed input instead of guessing", () => {
    expect(hexToColor("#ggg", 255)).toBeNull();
    expect(hexToColor("#12345", 255)).toBeNull();
    expect(hexToColor("", 255)).toBeNull();
    expect(hexToColor("#1677f", 255)).toBeNull();
  });

  it("clamps and rounds alpha", () => {
    expect(hexToColor("#000000", 300)?.a).toBe(255);
    expect(hexToColor("#000000", -5)?.a).toBe(0);
    expect(hexToColor("#000000", 127.6)?.a).toBe(128);
  });

  it("round-trips with colorToHex", () => {
    const c = { r: 99, g: 179, b: 237, a: 200 };
    expect(hexToColor(colorToHex(c), c.a)).toEqual(c);
  });
});
