import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore, selectEffectiveTool } from "../stores/uiStore";

beforeEach(() => {
  useUIStore.setState({
    activeTool: "select",
    spaceDown: false,
    layersOpen: true,
    inspectorOpen: true,
  });
});

describe("useUIStore", () => {
  it("defaults to the select tool", () => {
    expect(useUIStore.getState().activeTool).toBe("select");
  });

  it("setActiveTool updates activeTool", () => {
    useUIStore.getState().setActiveTool("pan");
    expect(useUIStore.getState().activeTool).toBe("pan");
  });

  it("toggleLayers flips layersOpen", () => {
    useUIStore.getState().toggleLayers();
    expect(useUIStore.getState().layersOpen).toBe(false);
    useUIStore.getState().toggleLayers();
    expect(useUIStore.getState().layersOpen).toBe(true);
  });

  it("toggleInspector flips inspectorOpen independently of layersOpen", () => {
    useUIStore.getState().toggleInspector();
    expect(useUIStore.getState().inspectorOpen).toBe(false);
    expect(useUIStore.getState().layersOpen).toBe(true);
  });
});

describe("selectEffectiveTool", () => {
  it("returns activeTool when space is not held", () => {
    useUIStore.setState({ activeTool: "select", spaceDown: false });
    expect(selectEffectiveTool(useUIStore.getState())).toBe("select");
  });

  it("returns 'pan' when space is held, regardless of activeTool", () => {
    useUIStore.setState({ activeTool: "select", spaceDown: true });
    expect(selectEffectiveTool(useUIStore.getState())).toBe("pan");
  });

  it("does not mutate activeTool when space is held", () => {
    useUIStore.setState({ activeTool: "select", spaceDown: true });
    selectEffectiveTool(useUIStore.getState());
    expect(useUIStore.getState().activeTool).toBe("select");
  });
});
