import { useCallback } from "react";
import { useEngineContext } from "../../contexts/EngineContext";
import { useFiles } from "../files/FilesProvider";
import { documentToSvg } from "./svg";

const SVG_MIME = "image/svg+xml";

/**
 * Export orchestration — Phase 7 M4 (ADR-026).
 *
 * Reads the main-thread document snapshot (`nodes`, kept live by the
 * worker's `document:nodes` broadcasts) and hands serialized bytes to the
 * files domain, which owns all disk I/O. Fire-and-forget like every
 * `files.*` action: FilesProvider surfaces failures through `fileError`,
 * and a user cancel is a normal outcome, not an error.
 *
 * The export's base name follows the file session (what the user calls
 * this file on disk), falling back to "Untitled" — the same identity the
 * window title shows.
 */
export function useExport(): { hasContent: boolean; exportSvg: () => void } {
  const { nodes } = useEngineContext();
  const { fileName, exportBlob } = useFiles();

  const hasContent = nodes.length > 0;

  const exportSvg = useCallback(() => {
    // Command gating (`enabled`) makes an empty call unreachable through
    // the registry; the guard covers future direct UI callers so a stray
    // click can never turn into documentToSvg's programming-error throw.
    if (nodes.length === 0) return;
    const base = (fileName ?? "Untitled").replace(/\.graphite$/i, "");
    const svg = documentToSvg(nodes, base);
    void exportBlob(new Blob([svg], { type: SVG_MIME }), {
      suggestedName: `${base}.svg`,
      description: "SVG image",
      mime: SVG_MIME,
      extension: ".svg",
    });
  }, [nodes, fileName, exportBlob]);

  return { hasContent, exportSvg };
}
