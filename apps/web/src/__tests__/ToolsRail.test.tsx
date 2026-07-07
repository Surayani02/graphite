// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToolsRail } from "../features/tools/ToolsRail";
import { useUIStore } from "../stores/uiStore";

beforeEach(() => {
  useUIStore.setState({ activeTool: "select", spaceDown: false });
});

describe("ToolsRail", () => {
  it("renders all four tools", () => {
    render(<ToolsRail />);
    expect(screen.getByRole("button", { name: "Select" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rectangle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ellipse" })).toBeInTheDocument();
  });

  it("marks the active tool as pressed", () => {
    render(<ToolsRail />);
    expect(screen.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Rectangle" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("clicking Rectangle updates the store", () => {
    render(<ToolsRail />);
    fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));
    expect(useUIStore.getState().activeTool).toBe("rectangle");
  });

  it("clicking Ellipse updates the store", () => {
    render(<ToolsRail />);
    fireEvent.click(screen.getByRole("button", { name: "Ellipse" }));
    expect(useUIStore.getState().activeTool).toBe("ellipse");
  });

  it("reflects the temporary space-held pan override without changing activeTool", () => {
    useUIStore.setState({ activeTool: "rectangle", spaceDown: true });
    render(<ToolsRail />);
    expect(screen.getByRole("button", { name: "Pan" })).toHaveAttribute("aria-pressed", "true");
    expect(useUIStore.getState().activeTool).toBe("rectangle"); // unchanged
  });

  it("is a single-tab-stop toolbar: only the active tool is tab-reachable", () => {
    render(<ToolsRail />);
    expect(screen.getByRole("button", { name: "Select" })).toHaveAttribute("tabIndex", "0");
    expect(screen.getByRole("button", { name: "Pan" })).toHaveAttribute("tabIndex", "-1");
  });

  it("ArrowDown moves the roving tab stop and activates the next tool", () => {
    render(<ToolsRail />);
    fireEvent.keyDown(screen.getByRole("toolbar"), { key: "ArrowDown" });
    expect(useUIStore.getState().activeTool).toBe("pan");
  });

  it("Home/End jump to the first/last tool", () => {
    render(<ToolsRail />);
    const toolbar = screen.getByRole("toolbar");
    fireEvent.keyDown(toolbar, { key: "End" });
    expect(useUIStore.getState().activeTool).toBe("ellipse");
    fireEvent.keyDown(toolbar, { key: "Home" });
    expect(useUIStore.getState().activeTool).toBe("select");
  });

  it("exposes keyboard shortcuts via aria-keyshortcuts", () => {
    render(<ToolsRail />);
    expect(screen.getByRole("button", { name: "Rectangle" })).toHaveAttribute(
      "aria-keyshortcuts",
      "R"
    );
  });
});
