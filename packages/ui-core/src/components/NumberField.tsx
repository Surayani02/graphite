import { useEffect, useState } from "react";

interface NumberFieldProps {
  label: string;
  value: number;
  min?: number;
  onCommit: (value: number) => void;
}

/**
 * Local draft value, committed on blur or Enter — not per keystroke, which
 * would send a node:update (and the resulting document:nodes rebroadcast)
 * on every character typed. The draft resyncs from `value` whenever the
 * prop changes from outside — selecting a different node, or a canvas
 * drag updating this same node (see input/pointer.ts's drag-end post).
 */
export function NumberField({ label, value, min, onCommit }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    // input[type=number] normalises anything it can't parse (including text
    // typed via fireEvent in tests, and pasted garbage in real usage) to an
    // empty string at the DOM level before onChange ever sees it. Number("")
    // is 0 — not NaN — so an empty draft would otherwise sail past the
    // Number.isFinite check below and silently commit `min` (or 0) instead
    // of reverting. Check for it explicitly first.
    if (draft.trim() === "") {
      setDraft(String(value));
      return;
    }
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) {
      onCommit(min !== undefined ? Math.max(min, parsed) : parsed);
    } else {
      setDraft(String(value)); // invalid input — revert
    }
  };

  return (
    <label className="flex items-center gap-2 text-[11px] text-content-tertiary">
      <span className="w-4 font-mono">{label}</span>
      <input
        type="number"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(String(value));
            e.currentTarget.blur();
          }
        }}
        className="w-full rounded border border-border-subtle bg-surface-canvas/60 px-1.5 py-1 font-mono text-[11px] text-content-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/60"
      />
    </label>
  );
}
