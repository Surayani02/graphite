// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ColorField } from "../components/ColorField";

const RED = { r: 255, g: 0, b: 0, a: 255 };

describe("ColorField", () => {
  it("renders the hex representation and alpha", () => {
    render(<ColorField label="Fill" value={RED} onCommit={vi.fn()} />);
    expect(screen.getByLabelText("Fill hex")).toHaveValue("#ff0000");
    expect(screen.getByLabelText("Fill alpha")).toHaveValue(255);
  });

  it("commits a valid hex edit on blur", () => {
    const onCommit = vi.fn();
    render(<ColorField label="Fill" value={RED} onCommit={onCommit} />);
    const hex = screen.getByLabelText("Fill hex");
    fireEvent.change(hex, { target: { value: "#00ff00" } });
    fireEvent.blur(hex);
    expect(onCommit).toHaveBeenCalledWith({ r: 0, g: 255, b: 0, a: 255 });
  });

  it("expands 3-digit shorthand on commit", () => {
    const onCommit = vi.fn();
    render(<ColorField label="Fill" value={RED} onCommit={onCommit} />);
    const hex = screen.getByLabelText("Fill hex");
    fireEvent.change(hex, { target: { value: "#0f0" } });
    fireEvent.blur(hex);
    expect(onCommit).toHaveBeenCalledWith({ r: 0, g: 255, b: 0, a: 255 });
  });

  it("reverts an invalid hex edit instead of committing garbage", () => {
    const onCommit = vi.fn();
    render(<ColorField label="Fill" value={RED} onCommit={onCommit} />);
    const hex = screen.getByLabelText("Fill hex");
    fireEvent.change(hex, { target: { value: "not-a-color" } });
    fireEvent.blur(hex);
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Fill hex")).toHaveValue("#ff0000");
  });

  it("commits a valid alpha edit on blur", () => {
    const onCommit = vi.fn();
    render(<ColorField label="Fill" value={RED} onCommit={onCommit} />);
    const alpha = screen.getByLabelText("Fill alpha");
    fireEvent.change(alpha, { target: { value: "128" } });
    fireEvent.blur(alpha);
    expect(onCommit).toHaveBeenCalledWith({ r: 255, g: 0, b: 0, a: 128 });
  });

  it("reverts an emptied alpha field instead of committing 0", () => {
    const onCommit = vi.fn();
    render(<ColorField label="Fill" value={RED} onCommit={onCommit} />);
    const alpha = screen.getByLabelText("Fill alpha");
    fireEvent.change(alpha, { target: { value: "" } });
    fireEvent.blur(alpha);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
