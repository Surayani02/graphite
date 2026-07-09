import { describe, expect, it } from "vitest";
import { createPanelRegistry, type PanelDescriptor } from "../features/panels/panelRegistry";
import { type UIState } from "../stores/uiStore";

function panel(id: string, over: Partial<PanelDescriptor> = {}): PanelDescriptor {
  return {
    id,
    title: id,
    area: "left",
    order: 0,
    component: () => null,
    isVisible: () => true,
    ...over,
  };
}

describe("createPanelRegistry", () => {
  it("registers and lists", () => {
    const r = createPanelRegistry();
    r.register(panel("a"));
    r.register(panel("b", { area: "right" }));
    expect(r.list().map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("throws on duplicate id", () => {
    const r = createPanelRegistry();
    r.register(panel("a"));
    expect(() => r.register(panel("a"))).toThrowError(/already registered/);
  });

  it("byArea filters and sorts by order, then registration order", () => {
    const r = createPanelRegistry();
    r.register(panel("late", { area: "left", order: 10 }));
    r.register(panel("early", { area: "left", order: 1 }));
    r.register(panel("right1", { area: "right", order: 0 }));
    r.register(panel("tie", { area: "left", order: 1 }));
    expect(r.byArea("left").map((p) => p.id)).toEqual(["early", "tie", "late"]);
    expect(r.byArea("right").map((p) => p.id)).toEqual(["right1"]);
  });

  it("unregister removes exactly that panel", () => {
    const r = createPanelRegistry();
    const off = r.register(panel("a"));
    r.register(panel("b"));
    off();
    expect(r.list().map((p) => p.id)).toEqual(["b"]);
  });

  it("isVisible reads UI state", () => {
    const r = createPanelRegistry();
    r.register(panel("insp", { isVisible: (s) => s.inspectorOpen }));
    const visible = r.list()[0]?.isVisible({ inspectorOpen: true } as UIState);
    const hidden = r.list()[0]?.isVisible({ inspectorOpen: false } as UIState);
    expect(visible).toBe(true);
    expect(hidden).toBe(false);
  });
});
