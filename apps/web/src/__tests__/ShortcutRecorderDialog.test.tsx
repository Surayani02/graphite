// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ensureBuiltinCommands } from "../features/commands/builtin";
import { createCommandRegistry } from "../features/commands/registry";
import { ShortcutRecorderDialog } from "../features/shortcuts/ShortcutRecorderDialog";
import { useUIStore } from "../stores/uiStore";

const registry = createCommandRegistry();
ensureBuiltinCommands(registry);

function openRecorder(target?: `${string}.${string}`): void {
  act(() => {
    useUIStore.getState().openShortcutRecorder(target);
  });
}

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

describe("ShortcutRecorderDialog", () => {
  it("renders nothing while closed", () => {
    render(<ShortcutRecorderDialog registry={registry} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens preselecting the target command", () => {
    render(<ShortcutRecorderDialog registry={registry} />);
    openRecorder("tool.rectangle");
    expect(screen.getByRole("dialog", { name: "Change keyboard shortcut" })).toBeInTheDocument();
    expect(screen.getByLabelText("Command")).toHaveValue("tool.rectangle");
  });

  it("captures a chord (ignoring bare modifiers) and saves it as an override", () => {
    render(<ShortcutRecorderDialog registry={registry} />);
    openRecorder("tool.rectangle");
    const capture = screen.getByLabelText("New shortcut");
    fireEvent.keyDown(capture, { key: "Shift", shiftKey: true });
    expect(capture).toHaveValue("");
    fireEvent.keyDown(capture, { key: "q" });
    expect(capture).toHaveValue("Q");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(useUIStore.getState().shortcutOverrides).toEqual({ "tool.rectangle": "q" });
    expect(useUIStore.getState().shortcutRecorderOpen).toBe(false);
  });

  it("warns when the captured chord belongs to another command", () => {
    render(<ShortcutRecorderDialog registry={registry} />);
    openRecorder("tool.rectangle");
    fireEvent.keyDown(screen.getByLabelText("New shortcut"), { key: "o" });
    expect(screen.getByRole("alert")).toHaveTextContent(/assigned to “Ellipse Tool”/);
  });

  it("Save stays disabled until a chord is captured", () => {
    render(<ShortcutRecorderDialog registry={registry} />);
    openRecorder("tool.rectangle");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("Remove binding writes an explicit unbind", () => {
    render(<ShortcutRecorderDialog registry={registry} />);
    openRecorder("file.save");
    fireEvent.click(screen.getByRole("button", { name: "Remove binding" }));
    expect(useUIStore.getState().shortcutOverrides).toEqual({ "file.save": null });
    expect(useUIStore.getState().shortcutRecorderOpen).toBe(false);
  });

  it("switching the command clears the pending capture", async () => {
    render(<ShortcutRecorderDialog registry={registry} />);
    openRecorder("tool.rectangle");
    const capture = screen.getByLabelText("New shortcut");
    fireEvent.keyDown(capture, { key: "q" });
    expect(capture).toHaveValue("Q");
    await userEvent.selectOptions(screen.getByLabelText("Command"), "tool.ellipse");
    expect(capture).toHaveValue("");
  });
});
