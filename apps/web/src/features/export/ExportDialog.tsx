import { useState } from "react";
import { ModalDialog, RadioGroup } from "@graphite/ui-core";
import type { RasterFormat } from "@graphite/protocol";

/**
 * Export dialog — Phase 7 M4b (ADR-026). Format choice plus the two
 * raster-only controls (scale, JPEG quality), which appear only when they
 * apply — SVG needs neither, PNG needs no quality. Pure presentation: it
 * owns transient form state and hands a resolved request to `onExport`;
 * serialization, GPU readback, and the gateway handoff live in useExport.
 */

export type ExportFormat = "svg" | RasterFormat;

export interface ExportRequest {
  readonly format: ExportFormat;
  /** Device-pixels per world unit (raster only; 1 for SVG). */
  readonly scale: number;
  /** JPEG encode quality 0..1 (JPEG only). */
  readonly quality: number;
}

interface ExportDialogProps {
  readonly isOpen: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onExport: (req: ExportRequest) => void;
}

const FORMAT_OPTIONS = [
  { value: "svg", label: "SVG — vector, infinitely scalable" },
  { value: "png", label: "PNG — raster, transparent background" },
  { value: "jpeg", label: "JPEG — raster, smaller file" },
];

const SCALE_OPTIONS = [
  { value: "1", label: "1×" },
  { value: "2", label: "2×" },
  { value: "3", label: "3×" },
];

const DEFAULT_SCALE = "2"; // retina-sharp without ballooning file size
const DEFAULT_QUALITY = 0.92; // near-lossless JPEG

export function ExportDialog({ isOpen, onOpenChange, onExport }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("svg");
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [quality, setQuality] = useState(DEFAULT_QUALITY);

  const isRaster = format !== "svg";
  const isJpeg = format === "jpeg";

  function handleExport() {
    onExport({
      format,
      scale: isRaster ? Number(scale) : 1,
      quality,
    });
    onOpenChange(false);
  }

  return (
    <ModalDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      label="Export design"
      widthClassName="w-full max-w-md"
    >
      <div className="flex flex-col gap-5 p-5">
        <h2 className="text-sm font-semibold text-text-primary">Export</h2>

        <RadioGroup
          label="Format"
          value={format}
          onChange={(v) => {
            setFormat(v as ExportFormat);
          }}
          options={FORMAT_OPTIONS}
        />

        {isRaster && (
          <RadioGroup label="Scale" value={scale} onChange={setScale} options={SCALE_OPTIONS} />
        )}

        {isJpeg && (
          <label className="flex flex-col gap-1.5 text-xs text-text-secondary">
            <span>Quality: {Math.round(quality * 100)}%</span>
            <input
              type="range"
              min={10}
              max={100}
              value={Math.round(quality * 100)}
              onChange={(e) => {
                setQuality(Number(e.target.value) / 100);
              }}
              className="accent-accent"
              aria-label="JPEG quality"
            />
          </label>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
            }}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
          >
            Export
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
