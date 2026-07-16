import type { DocNode } from "@graphite/protocol";

/**
 * Content-bounds and fit-camera math — Phase 7 M4 (ADR-026).
 *
 * One rule, two consumers: the SVG exporter derives its `viewBox` from
 * `contentBounds`, and the raster exporter (M4b) derives its off-screen
 * camera from `fitCamera` over the same bounds — a golden test asserts the
 * two frames agree, so vector and raster exports always show the same
 * picture.
 *
 * Bounds are *visual*, not geometric: the engine draws centre strokes
 * (shader contract), so a stroked shape paints `width / 2` beyond its
 * node bounds on every side — an export that ignored that would clip
 * strokes at the edges.
 */

/** Uniform margin around content: 2 % of the larger content dimension. */
export const EXPORT_MARGIN_RATIO = 0.02;

export interface ContentBounds {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Union of every node's visual bounds plus the uniform margin, in world
 * units. `null` for an empty document — the callers' export commands gate
 * on content, so `null` marks "nothing to export", never an error.
 *
 * A zero-area document (all nodes degenerate points/lines) still returns
 * bounds — the margin alone gives it extent, matching what the engine
 * would render.
 */
export function contentBounds(
  nodes: readonly DocNode[],
  marginRatio: number = EXPORT_MARGIN_RATIO
): ContentBounds | null {
  if (nodes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    // Mirror the engine's stroke-visibility threshold exactly: a stroke
    // paints (and so extends bounds) only when its alpha is non-zero.
    const halfStroke = node.stroke !== null && node.stroke.color.a > 0 ? node.stroke.width / 2 : 0;
    minX = Math.min(minX, node.x - halfStroke);
    minY = Math.min(minY, node.y - halfStroke);
    maxX = Math.max(maxX, node.x + node.w + halfStroke);
    maxY = Math.max(maxY, node.y + node.h + halfStroke);
  }

  const margin = Math.max(maxX - minX, maxY - minY) * marginRatio;
  return {
    x: minX - margin,
    y: minY - margin,
    w: maxX - minX + margin * 2,
    h: maxY - minY + margin * 2,
  };
}

export interface ExportCamera {
  readonly camX: number;
  readonly camY: number;
  readonly zoom: number;
  readonly vpW: number;
  readonly vpH: number;
}

/**
 * The off-screen camera that frames `bounds` exactly, at `scale` pixels
 * per world unit (M4b's raster path). The engine camera is centre-based
 * (`get_render_list` builds its frustum from cam ± vp/2·zoom), so the fit
 * is: centre on the bounds' midpoint, zoom = scale, viewport = bounds ×
 * scale, rounded up so no sub-pixel sliver of content falls outside the
 * texture.
 */
export function fitCamera(bounds: ContentBounds, scale: number): ExportCamera {
  return {
    camX: bounds.x + bounds.w / 2,
    camY: bounds.y + bounds.h / 2,
    zoom: scale,
    vpW: Math.ceil(bounds.w * scale),
    vpH: Math.ceil(bounds.h * scale),
  };
}
