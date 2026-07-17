/**
 * Outbound IPC helpers shared by every engine module.
 */

import type { EngineToMainMessage } from "@graphite/protocol";

export function post(msg: EngineToMainMessage, transfer?: Transferable[]): void {
  // The optional transfer list moves large payloads (raster export bytes)
  // across the boundary by reference instead of structured-cloning them —
  // a copy would defeat the whole point of returning a Uint8Array.
  if (transfer !== undefined) {
    // The transfer-list overload lives on DedicatedWorkerGlobalScope; this
    // module is typed under the worker lib at runtime but also pulled into
    // the DOM-lib unit-test graph. Narrow through a minimal shape so both
    // configs accept the two-arg form without a broad `any`.
    (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(
      msg,
      transfer
    );
  } else {
    self.postMessage(msg);
  }
}

/** Normalises an unknown thrown value into a typed `engine:error` message. */
export function toErrorMsg(raw: unknown): EngineToMainMessage {
  const e = raw instanceof Error ? raw : new Error(String(raw));
  if (e.stack !== undefined) {
    return { type: "engine:error", message: e.message, stack: e.stack };
  }
  return { type: "engine:error", message: e.message };
}
