import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { COLOR_WHITE, type RasterFormat } from "@graphite/protocol";
import { useEngineContext } from "../../contexts/EngineContext";
import { useFiles } from "../files/FilesProvider";
import { documentToSvg } from "./svg";
import type { ExportRequest } from "./ExportDialog";

const SVG_MIME = "image/svg+xml";
const RASTER_META: Record<RasterFormat, { mime: string; extension: string; description: string }> =
  {
    png: { mime: "image/png", extension: ".png", description: "PNG image" },
    jpeg: { mime: "image/jpeg", extension: ".jpg", description: "JPEG image" },
  };

interface UseExportResult {
  readonly hasContent: boolean;
  readonly isDialogOpen: boolean;
  readonly openDialog: () => void;
  readonly setDialogOpen: (open: boolean) => void;
  readonly runExport: (req: ExportRequest) => void;
}

/**
 * Export orchestration — Phase 7 M4 (ADR-026).
 *
 * Owns the export dialog's open state and dispatches a resolved
 * ExportRequest down the right path: SVG serializes the main-thread
 * document snapshot directly; PNG/JPEG round-trip through the worker's GPU
 * readback (bridge.exportRaster). Both hand final bytes to the files
 * domain, which owns disk I/O and surfaces failures through `fileError`;
 * a user cancel at the picker is a normal outcome.
 *
 * The export base name follows the file session — the identity the window
 * title shows — falling back to "Untitled".
 */
function useExportState(): UseExportResult {
  const { nodes, exportRaster } = useEngineContext();
  const { fileName, exportBlob } = useFiles();
  const [isDialogOpen, setDialogOpen] = useState(false);

  const hasContent = nodes.length > 0;
  const baseName = (fileName ?? "Untitled").replace(/\.graphite$/i, "");

  const runExport = useCallback(
    (req: ExportRequest) => {
      // Gating (command `enabled` + dialog only reachable with content)
      // makes an empty export unreachable; this guard covers direct callers
      // so a stray dispatch can't reach the serializer's empty-doc throw.
      if (nodes.length === 0) return;

      if (req.format === "svg") {
        const svg = documentToSvg(nodes, baseName);
        void exportBlob(new Blob([svg], { type: SVG_MIME }), {
          suggestedName: `${baseName}.svg`,
          description: "SVG image",
          mime: SVG_MIME,
          extension: ".svg",
        });
        return;
      }

      const meta = RASTER_META[req.format];
      // White background flattens JPEG transparency; PNG ignores it and
      // keeps its own alpha (worker contract).
      void exportRaster(req.format, req.scale, req.quality, COLOR_WHITE)
        .then((bytes) =>
          // Uint8Array from the worker transfer is ArrayBufferLike-backed;
          // BlobPart wants a concrete ArrayBufferView, which a plain
          // Uint8Array view over the same bytes satisfies.
          exportBlob(new Blob([new Uint8Array(bytes)], { type: meta.mime }), {
            suggestedName: `${baseName}${meta.extension}`,
            description: meta.description,
            mime: meta.mime,
            extension: meta.extension,
          })
        )
        .catch(() => {
          // Raster failures (empty doc, readback, encode) already surface
          // through the worker; swallow the rejection so it isn't an
          // unhandled promise. A user-visible error path lands with the
          // status/toast surface in a later milestone.
        });
    },
    [nodes, baseName, exportBlob, exportRaster]
  );

  const openDialog = useCallback(() => {
    setDialogOpen(true);
  }, []);

  return { hasContent, isDialogOpen, openDialog, setDialogOpen, runExport };
}

// ─── Provider (Phase 7 M4) ───────────────────────────────────────────────────
// The command context (for hasContent + openDialog) and the mounted
// ExportDialog (for isDialogOpen + runExport) must share ONE instance of the
// export state. A context provider is the same pattern FilesProvider uses for
// the same reason.

const ExportContext = createContext<UseExportResult | null>(null);

export function ExportProvider({ children }: { children: ReactNode }) {
  const value = useExportState();
  return <ExportContext.Provider value={value}>{children}</ExportContext.Provider>;
}

export function useExport(): UseExportResult {
  const ctx = useContext(ExportContext);
  if (ctx === null) {
    throw new Error("useExport must be used within an ExportProvider");
  }
  return ctx;
}
