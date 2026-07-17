// @vitest-environment jsdom
/**
 * ExportDialog — format choice drives which raster-only controls appear,
 * and confirm emits a resolved ExportRequest (Phase 7 M4b).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExportDialog, type ExportRequest } from "../features/export/ExportDialog";

function open(onExport: (r: ExportRequest) => void = vi.fn()) {
  return render(<ExportDialog isOpen onOpenChange={vi.fn()} onExport={onExport} />);
}

describe("ExportDialog", () => {
  it("defaults to SVG with neither scale nor quality controls shown", () => {
    open();
    expect(screen.getByRole("radio", { name: /SVG/ })).toBeChecked();
    expect(screen.queryByText("2×")).toBeNull(); // scale hidden for SVG
    expect(screen.queryByLabelText("JPEG quality")).toBeNull();
  });

  it("reveals the scale control once a raster format is chosen", () => {
    open();
    fireEvent.click(screen.getByRole("radio", { name: /PNG/ }));
    expect(screen.getByRole("radio", { name: "2×" })).toBeChecked(); // default scale
    // PNG has no quality control
    expect(screen.queryByLabelText("JPEG quality")).toBeNull();
  });

  it("reveals the quality slider only for JPEG", () => {
    open();
    fireEvent.click(screen.getByRole("radio", { name: /JPEG/ }));
    expect(screen.getByLabelText("JPEG quality")).toHaveValue("92"); // 0.92 default
  });

  it("emits an SVG request (scale forced to 1, no raster round-trip)", () => {
    const onExport = vi.fn();
    open(onExport);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(onExport).toHaveBeenCalledWith({ format: "svg", scale: 1, quality: 0.92 });
  });

  it("emits a PNG request carrying the chosen scale", () => {
    const onExport = vi.fn();
    open(onExport);
    fireEvent.click(screen.getByRole("radio", { name: /PNG/ }));
    fireEvent.click(screen.getByRole("radio", { name: "3×" }));
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(onExport).toHaveBeenCalledWith({ format: "png", scale: 3, quality: 0.92 });
  });

  it("emits a JPEG request with the adjusted quality", () => {
    const onExport = vi.fn();
    open(onExport);
    fireEvent.click(screen.getByRole("radio", { name: /JPEG/ }));
    fireEvent.change(screen.getByLabelText("JPEG quality"), { target: { value: "70" } });
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(onExport).toHaveBeenCalledWith({ format: "jpeg", scale: 2, quality: 0.7 });
  });
});
