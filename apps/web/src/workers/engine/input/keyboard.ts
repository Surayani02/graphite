import type { EngineState } from "../state";
import { setSelection } from "../selection";
import { cancelCreation } from "../scene/create";
import { deleteSelection } from "../scene/remove";

export function handleKeyDown(state: EngineState, key: string): void {
  if (key === "Escape") {
    // Mid-creation-drag, Escape means "not that one" (see cancelCreation's
    // doc comment on why it doesn't also return to the select tool) — it
    // does not also deselect. Otherwise, Escape deselects as it always has.
    if (state.creation !== null) {
      cancelCreation(state);
      return;
    }
    setSelection(state, null);
    return;
  }

  if (key === "Delete" || key === "Backspace") {
    deleteSelection(state);
  }
}
