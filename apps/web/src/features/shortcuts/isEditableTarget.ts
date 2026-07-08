/**
 * True when a key event targets something that consumes typing — text
 * inputs, textareas, selects, contenteditable — so global shortcuts must
 * stay out of the way. Single-letter tool chords ("r") firing while a user
 * renames a layer would be the classic global-listener bug; this is the
 * guard every keydown passes through first (previously module-local to
 * EngineCanvas, promoted here in M4 when the listener moved).
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}
