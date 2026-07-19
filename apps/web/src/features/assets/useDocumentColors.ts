import { useMemo } from "react";
import { type Color, type DocNode } from "@graphite/protocol";
import { useEngineContext } from "../../contexts/EngineContext";
import { colorToHex } from "../../document/color";

export interface DocumentColor {
  /** The exact protocol color, kept for lossless write-back on apply. */
  readonly color: Color;
  /** Display/dedup key — lowercase #rrggbb, "/a" suffixed when a < 255. */
  readonly hex: string;
  /** How many fills + strokes in the document use this color. */
  readonly usageCount: number;
}

/**
 * Pure derivation, exported for direct unit testing: unique fills and
 * stroke colors across the document, in first-appearance (document) order.
 * Fully transparent paint is "no paint", not a color, and is skipped;
 * colors differing only in alpha are distinct entries (they render
 * differently, so merging them would apply the wrong paint).
 */
export function deriveDocumentColors(nodes: readonly DocNode[]): readonly DocumentColor[] {
  const seen = new Map<string, { color: Color; count: number }>();
  const add = (color: Color): void => {
    if (color.a === 0) return;
    const key = color.a === 255 ? colorToHex(color) : `${colorToHex(color)}/${color.a}`;
    const entry = seen.get(key);
    if (entry === undefined) {
      seen.set(key, { color, count: 1 });
    } else {
      entry.count += 1;
    }
  };
  for (const node of nodes) {
    add(node.fill);
    if (node.stroke !== null) add(node.stroke.color);
  }
  return [...seen.entries()].map(([hex, entry]) => ({
    color: entry.color,
    hex,
    usageCount: entry.count,
  }));
}

/** Live document colours — Assets v1's single asset class (Blueprint M4). */
export function useDocumentColors(): readonly DocumentColor[] {
  const { nodes } = useEngineContext();
  return useMemo(() => deriveDocumentColors(nodes), [nodes]);
}
