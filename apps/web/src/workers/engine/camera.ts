import { MAX_ZOOM, MIN_ZOOM } from "@graphite/protocol";
import type { EngineState } from "./state";
import { post } from "./messaging";

/** Converts a CSS-pixel pointer position to world-space coordinates. */
export function cssToWorld(state: EngineState, cssX: number, cssY: number): [number, number] {
  return [
    (cssX * state.dpr - state.vpW / 2) / state.zoom + state.camX,
    (cssY * state.dpr - state.vpH / 2) / state.zoom + state.camY,
  ];
}

/** Zooms by `factor`, keeping the world point under `(pivotCssX, pivotCssY)` fixed on screen. */
export function zoomOnCursor(
  state: EngineState,
  factor: number,
  pivotCssX: number,
  pivotCssY: number
): void {
  const [worldPivotX, worldPivotY] = cssToWorld(state, pivotCssX, pivotCssY);
  const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.zoom * factor));
  const physPivotX = pivotCssX * state.dpr;
  const physPivotY = pivotCssY * state.dpr;
  state.camX = worldPivotX - (physPivotX - state.vpW / 2) / newZoom;
  state.camY = worldPivotY - (physPivotY - state.vpH / 2) / newZoom;
  state.zoom = newZoom;
}

export function notifyViewport(state: EngineState): void {
  post({ type: "viewport:changed", x: state.camX, y: state.camY, zoom: state.zoom });
}

/** Ctrl+wheel zooms on the cursor; bare wheel pans. */
export function handleWheel(
  state: EngineState,
  deltaX: number,
  deltaY: number,
  cssX: number,
  cssY: number,
  ctrl: boolean
): void {
  if (ctrl) {
    zoomOnCursor(state, Math.exp(-deltaY * 0.001), cssX, cssY);
  } else {
    state.camX += deltaX / state.zoom;
    state.camY += deltaY / state.zoom;
  }
  notifyViewport(state);
}
