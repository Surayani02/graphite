import type { Color, DocNode } from "@graphite/protocol";
import { contentBounds, type ContentBounds } from "./bounds";

/**
 * DocumentModel snapshot → standalone SVG — Phase 7 M4 (ADR-026).
 *
 * Parity contract with the GPU renderer, clause by clause:
 * - **Flat paint order.** The engine paints the explicit paint order
 *   (document insertion order); output is one element per node in that
 *   order — no `<g>` nesting, which could not interleave the way flat
 *   order can. Grouping is a documented future extension.
 * - **Frames render.** The engine pushes frames through the same shape
 *   pipeline as rects (the artboard background IS a filled rect), so
 *   frames serialize as `<rect>` too.
 * - **Centre strokes on both sides.** The shader draws centre-aligned
 *   strokes; SVG's default `stroke-alignment` is also centre. No
 *   compensation needed — widths map 1:1.
 * - **Stroke threshold.** A stroke paints only when `alpha > 0`, exactly
 *   the engine's condition — a `{transparent, 0}` cleared stroke emits no
 *   stroke attributes at all.
 * - **World units are user units.** Node coordinates pass through
 *   unchanged; the viewBox (from `contentBounds`, stroke-aware, 2 %
 *   margin) does the framing.
 */

/** 3-decimal formatting, trailing zeros trimmed — deterministic goldens. */
function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

function fillAttrs(fill: Color): string {
  if (fill.a === 0) return ` fill="none"`;
  const rgb = ` fill="rgb(${String(fill.r)},${String(fill.g)},${String(fill.b)})"`;
  return fill.a === 255 ? rgb : `${rgb} fill-opacity="${fmt(fill.a / 255)}"`;
}

function strokeAttrs(node: DocNode): string {
  if (node.stroke === null || node.stroke.color.a === 0) return "";
  const { color, width } = node.stroke;
  const base = ` stroke="rgb(${String(color.r)},${String(color.g)},${String(color.b)})" stroke-width="${fmt(width)}"`;
  return color.a === 255 ? base : `${base} stroke-opacity="${fmt(color.a / 255)}"`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function nodeToElement(node: DocNode): string {
  if (node.kind === "ellipse") {
    return (
      `<ellipse cx="${fmt(node.x + node.w / 2)}" cy="${fmt(node.y + node.h / 2)}"` +
      ` rx="${fmt(node.w / 2)}" ry="${fmt(node.h / 2)}"` +
      `${fillAttrs(node.fill)}${strokeAttrs(node)}/>`
    );
  }
  // frame + rect: the engine renders both through the rect pipeline.
  const rx = node.cornerRadius > 0 ? ` rx="${fmt(node.cornerRadius)}"` : "";
  return (
    `<rect x="${fmt(node.x)}" y="${fmt(node.y)}"` +
    ` width="${fmt(node.w)}" height="${fmt(node.h)}"${rx}` +
    `${fillAttrs(node.fill)}${strokeAttrs(node)}/>`
  );
}

export interface SvgExportOptions {
  readonly marginRatio?: number;
}

/**
 * Serializes the whole document to a standalone SVG string.
 *
 * Precondition: a non-empty document — export commands gate on content
 * (`contentBounds` returning `null` marks "nothing to export"), so an
 * empty call here is a programming error and throws.
 */
export function documentToSvg(
  nodes: readonly DocNode[],
  docName: string,
  opts: SvgExportOptions = {}
): string {
  const bounds: ContentBounds | null = contentBounds(nodes, opts.marginRatio);
  if (bounds === null) {
    throw new Error("Cannot export an empty document — the export command gates on content");
  }

  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(bounds.x)} ${fmt(bounds.y)} ${fmt(bounds.w)} ${fmt(bounds.h)}" width="${fmt(bounds.w)}" height="${fmt(bounds.h)}">`,
    `  <title>${escapeXml(docName)}</title>`,
  ];
  for (const node of nodes) {
    lines.push(`  ${nodeToElement(node)}`);
  }
  lines.push(`</svg>`, ``);
  return lines.join("\n");
}
