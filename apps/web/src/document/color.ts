import type { Color } from "@graphite/protocol";

/**
 * Color → 6-digit hex, for native `<input type="color">` (which has no
 * alpha channel — alpha is edited as a separate field, see ColorField).
 */
export function colorToHex(c: Color): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}

const HEX6 = /^[0-9a-f]{6}$/i;
const HEX3 = /^[0-9a-f]{3}$/i;

/**
 * Hex string + separate alpha (0–255) → Color, or `null` if the hex is not
 * a valid 3- or 6-digit value.
 *
 * Returning `null` (instead of a per-channel `|| 0` fallback, which a
 * previous version used) lets the caller revert the field to its last
 * committed value — the same behaviour NumberField already has for invalid
 * numeric input. The `|| 0` fallback had a second, sneakier failure:
 * 3-digit CSS shorthand (`#fff`) sliced into pairs as `ff`/`f`/`` and
 * committed `{r:255, g:15, b:0}` — valid-looking garbage. Shorthand is now
 * expanded per the CSS rule (each digit doubled) instead.
 */
export function hexToColor(hex: string, alpha: number): Color | null {
  let clean = hex.replace("#", "").trim();
  if (HEX3.test(clean)) {
    clean = clean
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  if (!HEX6.test(clean)) return null;

  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
    a: Math.max(0, Math.min(255, Math.round(alpha))),
  };
}
