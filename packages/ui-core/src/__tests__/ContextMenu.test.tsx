// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ContextMenu, type MenuItem } from "../components/ContextMenu";

const waitForPosition = () => act(async () => {});

function items(onSelect: () => void): MenuItem[] {
  return [
    { id: "delete", label: "Delete", shortcut: "Del", danger: true, onSelect },
    { id: "disabled", label: "Disabled item", disabled: true, onSelect: vi.fn() },
  ];
}

describe("ContextMenu", () => {
  it("renders nothing when closed", () => {
    render(
      <ContextMenu
        open={false}
        position={{ x: 0, y: 0 }}
        items={items(vi.fn())}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("renders every item when open", async () => {
    render(
      <ContextMenu open position={{ x: 10, y: 10 }} items={items(vi.fn())} onClose={vi.fn()} />
    );
    await waitForPosition();
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Delete/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Disabled item" })).toBeDisabled();
  });

  it("calls onSelect and onClose when an item is activated", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <ContextMenu open position={{ x: 0, y: 0 }} items={items(onSelect)} onClose={onClose} />
    );
    await waitForPosition();
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<ContextMenu open position={{ x: 0, y: 0 }} items={items(vi.fn())} onClose={onClose} />);
    await waitForPosition();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("navigates with ArrowDown and activates the focused item with Enter", async () => {
    // useListNavigation uses real DOM focus (not virtual), so a keydown
    // must be dispatched on whichever element currently holds focus —
    // exactly as a real browser would, since that's genuinely where the
    // event originates.
    const onSelect = vi.fn();
    render(
      <ContextMenu open position={{ x: 0, y: 0 }} items={items(onSelect)} onClose={vi.fn()} />
    );
    await waitForPosition();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    await waitForPosition();
    expect(document.activeElement).toHaveAttribute("role", "menuitem");
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
