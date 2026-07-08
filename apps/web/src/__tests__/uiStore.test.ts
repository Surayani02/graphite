import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore, selectEffectiveTool } from "../stores/uiStore";

beforeEach(() => {
  useUIStore.setState({
    activeTool: "select",
    spaceDown: false,
    layersOpen: true,
    inspectorOpen: true,
    leftPanelTab: "layers",
    paletteOpen: false,
    shortcutRecorderOpen: false,
    shortcutRecorderTarget: null,
    shortcutOverrides: {},
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

describe("left panel tab (M4)", () => {
  it("setLeftPanelTab switches the tab and reveals a collapsed panel", () => {
    useUIStore.setState({ layersOpen: false });
    useUIStore.getState().setLeftPanelTab("assets");
    expect(useUIStore.getState().leftPanelTab).toBe("assets");
    expect(useUIStore.getState().layersOpen).toBe(true);
  });
});

describe("palette and recorder modality (M4)", () => {
  it("openPalette/closePalette toggle visibility", () => {
    useUIStore.getState().openPalette();
    expect(useUIStore.getState().paletteOpen).toBe(true);
    useUIStore.getState().closePalette();
    expect(useUIStore.getState().paletteOpen).toBe(false);
  });

  it("opening the recorder closes the palette and records the target", () => {
    useUIStore.getState().openPalette();
    useUIStore.getState().openShortcutRecorder("tool.rectangle");
    const s = useUIStore.getState();
    expect(s.shortcutRecorderOpen).toBe(true);
    expect(s.shortcutRecorderTarget).toBe("tool.rectangle");
    expect(s.paletteOpen).toBe(false);
    s.closeShortcutRecorder();
    expect(useUIStore.getState().shortcutRecorderTarget).toBeNull();
  });
});

describe("shortcut overrides (M4)", () => {
  it("setShortcutOverride records rebinds and explicit unbinds", () => {
    useUIStore.getState().setShortcutOverride("tool.rectangle", "q");
    useUIStore.getState().setShortcutOverride("tool.ellipse", null);
    expect(useUIStore.getState().shortcutOverrides).toEqual({
      "tool.rectangle": "q",
      "tool.ellipse": null,
    });
  });

  it("keeps one chord to one command among overrides", () => {
    useUIStore.getState().setShortcutOverride("tool.rectangle", "q");
    useUIStore.getState().setShortcutOverride("tool.ellipse", "q");
    expect(useUIStore.getState().shortcutOverrides).toEqual({
      "tool.rectangle": null,
      "tool.ellipse": "q",
    });
  });

  it("resetShortcuts clears every override", () => {
    useUIStore.getState().setShortcutOverride("tool.rectangle", "q");
    useUIStore.getState().resetShortcuts();
    expect(useUIStore.getState().shortcutOverrides).toEqual({});
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
