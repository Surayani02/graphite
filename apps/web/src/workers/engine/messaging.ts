/**
 * Outbound IPC helpers shared by every engine module.
 */

import type { EngineToMainMessage } from "@graphite/protocol";

export function post(msg: EngineToMainMessage): void {
  self.postMessage(msg);
}

/** Normalises an unknown thrown value into a typed `engine:error` message. */
export function toErrorMsg(raw: unknown): EngineToMainMessage {
  const e = raw instanceof Error ? raw : new Error(String(raw));
  if (e.stack !== undefined) {
    return { type: "engine:error", message: e.message, stack: e.stack };
  }
  return { type: "engine:error", message: e.message };
}
