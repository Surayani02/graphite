import { useEffect, useRef, useState } from "react";
import type { Color } from "@graphite/protocol";
import { colorToHex, hexToColor } from "../../document/color";

interface ColorFieldProps {
  label: string;
  value: Color;
  onCommit: (color: Color) => void;
}

export function ColorField({ label, value, onCommit }: ColorFieldProps) {
  const [hexDraft, setHexDraft] = useState(colorToHex(value));
  const [alphaDraft, setAlphaDraft] = useState(String(value.a));

  useEffect(() => {
    setHexDraft(colorToHex(value));
    setAlphaDraft(String(value.a));
  }, [value]);

  // The native color picker streams `input` events continuously while its
  // popup is being dragged (React's onChange). Committing each one would
  // fire node:update — and the worker's full document:nodes rebroadcast —
  // at pointer rate, exactly the storm input/pointer.ts avoids for drags.
  // Leading+trailing rAF throttle: the first change in a frame commits
  // immediately (so single edits — and tests — stay synchronous), the rest
  // of that frame coalesces into one trailing commit.
  const pendingRef = useRef<Color | null>(null);
  const rafRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const throttledCommit = (color: Color) => {
    if (rafRef.current !== null) {
      pendingRef.current = color;
      return;
    }
    onCommit(color);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (pendingRef.current) {
        const pending = pendingRef.current;
        pendingRef.current = null;
        throttledCommit(pending);
      }
    });
  };

  /** Hex text commit: parse-or-revert, same contract as NumberField. */
  const commitHexDraft = () => {
    const parsed = hexToColor(hexDraft, value.a);
    if (parsed) {
      onCommit(parsed);
    } else {
      setHexDraft(colorToHex(value)); // invalid input — revert
    }
  };

  const commitAlpha = () => {
    // Same pitfall as NumberField: input[type=number] normalises invalid
    // text to "" at the DOM level, and Number("") is 0 (not NaN) — check
    // for it explicitly so garbage input reverts to the current alpha
    // instead of silently committing 0.
    if (alphaDraft.trim() === "") {
      setAlphaDraft(String(value.a));
      return;
    }
    const a = Number(alphaDraft);
    if (!Number.isFinite(a)) {
      setAlphaDraft(String(value.a));
      return;
    }
    const parsed = hexToColor(hexDraft, a);
    if (parsed) onCommit(parsed);
  };

  const fieldClasses =
    "rounded border border-border-subtle bg-surface-canvas/60 px-1.5 py-1 font-mono text-[11px] text-content-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/60";

  return (
    <div className="flex items-center gap-2 text-[11px] text-content-tertiary">
      <span className="w-4 font-mono">{label}</span>
      <input
        type="color"
        value={hexDraft}
        onChange={(e) => {
          // The picker only ever emits valid #rrggbb, so hexToColor cannot
          // return null here — but guard anyway rather than assert.
          setHexDraft(e.target.value);
          const parsed = hexToColor(e.target.value, value.a);
          if (parsed) throttledCommit(parsed);
        }}
        className="h-6 w-6 shrink-0 cursor-pointer rounded border border-border-subtle bg-transparent p-0 focus:outline-none focus:ring-1 focus:ring-accent/60"
        aria-label={`${label} color`}
      />
      <input
        type="text"
        value={hexDraft}
        onChange={(e) => {
          setHexDraft(e.target.value);
        }}
        onBlur={commitHexDraft}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setHexDraft(colorToHex(value));
            e.currentTarget.blur();
          }
        }}
        className={`w-16 ${fieldClasses}`}
        aria-label={`${label} hex`}
      />
      <input
        type="number"
        min={0}
        max={255}
        value={alphaDraft}
        onChange={(e) => {
          setAlphaDraft(e.target.value);
        }}
        onBlur={commitAlpha}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={`w-12 ${fieldClasses}`}
        aria-label={`${label} alpha`}
      />
    </div>
  );
}
