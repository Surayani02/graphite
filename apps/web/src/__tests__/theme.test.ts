import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { resolveTheme, applyTheme } from "../features/theme/theme";

describe("resolveTheme", () => {
  it("returns the explicit choice for dark and light regardless of OS", () => {
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("follows the OS for system", () => {
    expect(resolveTheme("system", true)).toBe("light");
    expect(resolveTheme("system", false)).toBe("dark");
  });
});

describe("applyTheme", () => {
  const original = globalThis.document;
  beforeEach(() => {
    // Minimal documentElement.dataset stub for the node environment.
    const dataset: Record<string, string> = {};
    // @ts-expect-error — deliberately partial document for this unit.
    globalThis.document = { documentElement: { dataset } };
  });
  afterEach(() => {
    globalThis.document = original;
  });

  it("sets data-theme=light for the light theme", () => {
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("removes the attribute for dark (the default block carries none)", () => {
    applyTheme("light");
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
