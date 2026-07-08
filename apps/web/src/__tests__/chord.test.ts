import { describe, expect, it } from "vitest";
import {
  chordFromEvent,
  formatChord,
  normalizeChord,
  toAriaKeyshortcuts,
} from "../features/shortcuts/chord";

function key(
  k: string,
  mods: Partial<{ ctrl: boolean; meta: boolean; alt: boolean; shift: boolean }> = {}
) {
  return {
    key: k,
    ctrlKey: mods.ctrl ?? false,
    metaKey: mods.meta ?? false,
    altKey: mods.alt ?? false,
    shiftKey: mods.shift ?? false,
  };
}

describe("normalizeChord", () => {
  it("lowercases, resolves aliases, and orders modifiers canonically", () => {
    expect(normalizeChord("Mod+Shift+K")).toBe("mod+shift+k");
    expect(normalizeChord("shift+alt+mod+p")).toBe("mod+alt+shift+p");
    expect(normalizeChord("cmd+s")).toBe("mod+s");
    expect(normalizeChord("Control+Option+Del")).toBe("ctrl+alt+delete");
    expect(normalizeChord("Esc")).toBe("escape");
    expect(normalizeChord("r")).toBe("r");
  });

  it("rejects everything that is not exactly modifiers-plus-one-key", () => {
    expect(normalizeChord("")).toBeNull();
    expect(normalizeChord("mod+")).toBeNull();
    expect(normalizeChord("mod+shift")).toBeNull();
    expect(normalizeChord("shift+shift+a")).toBeNull();
    expect(normalizeChord("a+b")).toBeNull();
  });
});

describe("chordFromEvent", () => {
  it("maps the platform-primary modifier to mod", () => {
    expect(chordFromEvent(key("k", { ctrl: true }), "other")).toBe("mod+k");
    expect(chordFromEvent(key("k", { meta: true }), "mac")).toBe("mod+k");
  });

  it("keeps the secondary modifier literal per platform", () => {
    expect(chordFromEvent(key("k", { ctrl: true }), "mac")).toBe("ctrl+k");
    expect(chordFromEvent(key("k", { meta: true }), "other")).toBe("meta+k");
  });

  it("orders stacked modifiers canonically and lowercases shifted letters", () => {
    expect(chordFromEvent(key("P", { ctrl: true, alt: true, shift: true }), "other")).toBe(
      "mod+alt+shift+p"
    );
    expect(chordFromEvent(key("R", { shift: true }), "other")).toBe("shift+r");
  });

  it("returns null for bare modifier presses and names special keys", () => {
    expect(chordFromEvent(key("Shift", { shift: true }), "other")).toBeNull();
    expect(chordFromEvent(key("Control", { ctrl: true }), "other")).toBeNull();
    expect(chordFromEvent(key("Delete"), "other")).toBe("delete");
    expect(chordFromEvent(key(" "), "other")).toBe("space");
  });
});

describe("formatChord", () => {
  it("uses HIG-ordered symbols on mac and plus-joined labels elsewhere", () => {
    expect(formatChord("mod+k", "mac")).toBe("⌘K");
    expect(formatChord("mod+shift+k", "mac")).toBe("⇧⌘K");
    expect(formatChord("mod+k", "other")).toBe("Ctrl+K");
    expect(formatChord("mod+alt+\\", "other")).toBe("Ctrl+Alt+\\");
    expect(formatChord("delete", "other")).toBe("Del");
  });
});

describe("toAriaKeyshortcuts", () => {
  it("emits spec-compliant names, resolving mod per platform", () => {
    expect(toAriaKeyshortcuts("mod+s", "other")).toBe("Control+S");
    expect(toAriaKeyshortcuts("mod+s", "mac")).toBe("Meta+S");
    expect(toAriaKeyshortcuts("delete", "other")).toBe("Delete");
    expect(toAriaKeyshortcuts("v", "other")).toBe("V");
  });
});
