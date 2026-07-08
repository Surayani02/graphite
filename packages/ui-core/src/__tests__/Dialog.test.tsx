// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ModalDialog } from "../components/Dialog";

function Fixture({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <ModalDialog isOpen={isOpen} onOpenChange={onOpenChange} label="Test dialog">
      <button type="button">Inside</button>
    </ModalDialog>
  );
}

describe("ModalDialog", () => {
  it("renders nothing while closed", () => {
    render(<Fixture isOpen={false} onOpenChange={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders an accessible, focus-managed dialog while open", () => {
    render(<Fixture isOpen onOpenChange={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Test dialog" });
    expect(dialog).toBeInTheDocument();
    // React Aria moves focus into the dialog on open — the essence of the
    // trap; jsdom can't exercise Tab-cycling, Playwright covers that at M5.
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("requests close on Escape", async () => {
    const onOpenChange = vi.fn();
    render(<Fixture isOpen onOpenChange={onOpenChange} />);
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
