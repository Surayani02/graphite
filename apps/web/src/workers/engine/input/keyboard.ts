import type { EngineState } from "../state";
import { setSelection } from "../selection";

export function handleKeyDown(state: EngineState, key: string): void {
  if (key === "Escape") setSelection(state, null);
}
