import { describe, expect, it } from "vitest";
import { type CommandDescriptor } from "../features/commands/types";
import { resolveShortcuts } from "../features/shortcuts/shortcutMap";

function cmd(id: `${string}.${string}`, defaultChords?: readonly string[]): CommandDescriptor {
  return {
    id,
    title: id,
    category: "Edit",
    run: () => {},
    ...(defaultChords !== undefined ? { defaultChords } : {}),
  };
}

describe("resolveShortcuts", () => {
  it("resolves defaults, including multi-chord aliases", () => {
    const r = resolveShortcuts([cmd("edit.delete", ["delete", "backspace"])], {});
    expect(r.byChord.get("delete")).toBe("edit.delete");
    expect(r.byChord.get("backspace")).toBe("edit.delete");
    expect(r.byCommand.get("edit.delete")).toEqual(["delete", "backspace"]);
  });

  it("normalizes declared defaults into canonical chords", () => {
    const r = resolveShortcuts([cmd("file.save", ["Cmd+S"])], {});
    expect(r.byChord.get("mod+s")).toBe("file.save");
  });

  it("an override replaces every default chord of that command", () => {
    const r = resolveShortcuts([cmd("edit.delete", ["delete", "backspace"])], {
      "edit.delete": "x",
    });
    expect(r.byCommand.get("edit.delete")).toEqual(["x"]);
    expect(r.byChord.has("delete")).toBe(false);
    expect(r.byChord.has("backspace")).toBe(false);
  });

  it("null and invalid overrides both resolve to unbound", () => {
    const commands = [cmd("a.one", ["q"]), cmd("b.two", ["w"])];
    const r = resolveShortcuts(commands, { "a.one": null, "b.two": "mod+" });
    expect(r.byCommand.get("a.one")).toEqual([]);
    expect(r.byCommand.get("b.two")).toEqual([]);
    expect(r.byChord.size).toBe(0);
  });

  it("an override shadows a colliding default from another command", () => {
    const commands = [cmd("a.one", ["q"]), cmd("b.two", ["w"])];
    const r = resolveShortcuts(commands, { "b.two": "q" });
    expect(r.byChord.get("q")).toBe("b.two");
    expect(r.byCommand.get("a.one")).toEqual([]);
    expect(r.byCommand.get("b.two")).toEqual(["q"]);
  });

  it("breaks same-tier ties by registry order (corrupt-storage determinism)", () => {
    const commands = [cmd("a.one"), cmd("b.two")];
    const r = resolveShortcuts(commands, { "a.one": "q", "b.two": "q" });
    expect(r.byChord.get("q")).toBe("a.one");
    expect(r.byCommand.get("b.two")).toEqual([]);
  });
});
