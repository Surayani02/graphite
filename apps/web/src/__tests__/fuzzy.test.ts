import { describe, expect, it } from "vitest";
import { fuzzyScore } from "../features/commands/fuzzy";

describe("fuzzyScore", () => {
  it("returns 0 for non-matches and 1 for an empty query", () => {
    expect(fuzzyScore("xyz", "Save")).toBe(0);
    expect(fuzzyScore("", "anything")).toBe(1);
    expect(fuzzyScore("   ", "anything")).toBe(1);
  });

  it("matches case-insensitive subsequences", () => {
    expect(fuzzyScore("SAVE", "save document")).toBeGreaterThan(0);
    expect(fuzzyScore("sd", "Save Document")).toBeGreaterThan(0);
    expect(fuzzyScore("sdx", "Save Document")).toBe(0);
  });

  it("ranks word-boundary matches above scattered ones", () => {
    expect(fuzzyScore("sd", "Save Document")).toBeGreaterThan(fuzzyScore("sd", "aside"));
  });

  it("prefers consecutive runs over gapped matches", () => {
    expect(fuzzyScore("rect", "Rectangle Tool")).toBeGreaterThan(
      fuzzyScore("rect", "Rotate object")
    );
  });

  it("prefers the shorter target when structure is equal", () => {
    expect(fuzzyScore("save", "Save")).toBeGreaterThan(fuzzyScore("save", "Save Document"));
  });

  it("never lets the length penalty produce a false negative", () => {
    expect(fuzzyScore("z", `a${"z".repeat(250)}`)).toBe(1);
    expect(fuzzyScore("a", "a".padEnd(200, "z"))).toBeGreaterThan(0);
  });
});
