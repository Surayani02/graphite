// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NumberField } from "../components/NumberField";

describe("NumberField", () => {
  it("renders the current value", () => {
    render(<NumberField label="W" value={42} onCommit={vi.fn()} />);
    expect(screen.getByDisplayValue("42")).toBeInTheDocument();
  });

  it("commits a valid edit on blur", () => {
    const onCommit = vi.fn();
    render(<NumberField label="W" value={42} onCommit={onCommit} />);
    const input = screen.getByDisplayValue("42");
    fireEvent.change(input, { target: { value: "99" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(99);
  });

  it("commits on Enter (via blur)", () => {
    // The component's Enter handler calls currentTarget.blur() — jsdom
    // only dispatches a real blur event for an element that currently has
    // focus, so the input must be focused first to exercise that path.
    const onCommit = vi.fn();
    render(<NumberField label="W" value={42} onCommit={onCommit} />);
    const input = screen.getByDisplayValue("42");
    input.focus();
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(10);
  });

  it("reverts on Escape without committing", () => {
    const onCommit = vi.fn();
    render(<NumberField label="W" value={42} onCommit={onCommit} />);
    const input = screen.getByDisplayValue("42");
    fireEvent.change(input, { target: { value: "999" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("42")).toBeInTheDocument();
  });

  it("reverts an unparseable edit instead of committing", () => {
    const onCommit = vi.fn();
    render(<NumberField label="W" value={42} onCommit={onCommit} />);
    const input = screen.getByDisplayValue("42");
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("42")).toBeInTheDocument();
  });

  it("reverts an emptied field instead of committing min/0", () => {
    const onCommit = vi.fn();
    render(<NumberField label="W" value={42} min={1} onCommit={onCommit} />);
    const input = screen.getByDisplayValue("42");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("clamps to min", () => {
    const onCommit = vi.fn();
    render(<NumberField label="W" value={42} min={1} onCommit={onCommit} />);
    const input = screen.getByDisplayValue("42");
    fireEvent.change(input, { target: { value: "-5" } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith(1);
  });

  it("resyncs its draft when the value prop changes externally", () => {
    const { rerender } = render(<NumberField label="W" value={42} onCommit={vi.fn()} />);
    rerender(<NumberField label="W" value={7} onCommit={vi.fn()} />);
    expect(screen.getByDisplayValue("7")).toBeInTheDocument();
  });
});
