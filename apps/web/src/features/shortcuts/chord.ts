/**
 * Chord model for keyboard shortcuts (Phase 6 M4, ADR-015).
 *
 * A chord is a canonical string: zero or more modifiers and exactly one
 * key, joined with "+" — "mod+shift+k", "r". Canonical form: every token
 * lowercase, modifiers ordered mod → ctrl → alt → shift → meta.
 *
 * "mod" is the platform-primary modifier — ⌘ on macOS, Ctrl elsewhere — so
 * persisted overrides stay portable across a user's machines. The
 * *secondary* modifier keeps its literal name (mac Ctrl stays "ctrl", the
 * Windows key stays "meta").
 *
 * Keys come from `KeyboardEvent.key`, lowercased ("delete", "arrowup"),
 * with " " mapped to "space". Documented limitation rather than a solved
 * one: shifted symbol keys bind as the produced character (Shift+1 is
 * "shift+!") because `e.key` is layout-aware and `e.code` is not —
 * layout-aware wins for an international user base, and no default binding
 * uses a shifted symbol.
 */

export type Chord = string;

export type ChordPlatform = "mac" | "other";

const MODIFIER_ORDER = ["mod", "ctrl", "alt", "shift", "meta"] as const;
type Modifier = (typeof MODIFIER_ORDER)[number];

const MODIFIER_ALIASES: Readonly<Record<string, Modifier>> = {
  mod: "mod",
  cmd: "mod",
  command: "mod",
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  opt: "alt",
  shift: "shift",
  meta: "meta",
  win: "meta",
  super: "meta",
};

const KEY_ALIASES: Readonly<Record<string, string>> = {
  " ": "space",
  spacebar: "space",
  esc: "escape",
  del: "delete",
  return: "enter",
  up: "arrowup",
  down: "arrowdown",
  left: "arrowleft",
  right: "arrowright",
};

/** `KeyboardEvent.key` values that are a modifier being pressed alone. */
const BARE_MODIFIER_KEYS: ReadonlySet<string> = new Set([
  "control",
  "shift",
  "alt",
  "meta",
  "os",
  "altgraph",
]);

/** Best-effort platform detection; deterministically "other" outside a browser. */
export function detectChordPlatform(): ChordPlatform {
  if (typeof navigator === "undefined") return "other";
  const probe = `${navigator.platform} ${navigator.userAgent}`;
  return /mac|iphone|ipad|ipod/i.test(probe) ? "mac" : "other";
}

function isModifier(token: string): token is Modifier {
  return (MODIFIER_ORDER as readonly string[]).includes(token);
}

/**
 * Normalize a declared chord ("Cmd+Shift+K", "del") to canonical form, or
 * `null` when the input is not a valid chord (empty, modifier-only,
 * duplicate modifier, more than one key). Invalid persisted overrides flow
 * through here and resolve to "unbound" rather than crashing resolution.
 */
export function normalizeChord(raw: string): Chord | null {
  const tokens = raw
    .trim()
    .toLowerCase()
    .split("+")
    .map((t) => t.trim());
  if (tokens.some((t) => t.length === 0)) return null;

  const mods = new Set<Modifier>();
  let key: string | null = null;
  for (const token of tokens) {
    const modifier = MODIFIER_ALIASES[token];
    if (modifier !== undefined) {
      if (mods.has(modifier)) return null;
      mods.add(modifier);
      continue;
    }
    if (key !== null) return null;
    key = KEY_ALIASES[token] ?? token;
  }
  if (key === null) return null;

  return [...MODIFIER_ORDER.filter((m) => mods.has(m)), key].join("+");
}

/**
 * The chord a keydown represents, or `null` for a bare modifier press.
 * Platform decides which physical modifier reads as "mod" (module
 * comment). Takes the event's key/modifier fields only, so plain objects
 * work in node-environment tests.
 */
export function chordFromEvent(
  e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
  platform: ChordPlatform = detectChordPlatform()
): Chord | null {
  const rawKey = e.key.toLowerCase();
  if (BARE_MODIFIER_KEYS.has(rawKey)) return null;
  const key = KEY_ALIASES[rawKey] ?? rawKey;

  const mods = new Set<Modifier>();
  if (platform === "mac") {
    if (e.metaKey) mods.add("mod");
    if (e.ctrlKey) mods.add("ctrl");
  } else {
    if (e.ctrlKey) mods.add("mod");
    if (e.metaKey) mods.add("meta");
  }
  if (e.altKey) mods.add("alt");
  if (e.shiftKey) mods.add("shift");

  return [...MODIFIER_ORDER.filter((m) => mods.has(m)), key].join("+");
}

// ─── Display ──────────────────────────────────────────────────────────────────

/** Apple HIG modifier display order — ⌃⌥⇧⌘, i.e. ⌘ closest to the key. */
const MAC_DISPLAY_ORDER: readonly Modifier[] = ["ctrl", "alt", "shift", "mod", "meta"];

const MAC_MODIFIER_SYMBOLS: Readonly<Record<Modifier, string>> = {
  mod: "⌘",
  ctrl: "⌃",
  alt: "⌥",
  shift: "⇧",
  meta: "⌘",
};

const OTHER_MODIFIER_LABELS: Readonly<Record<Modifier, string>> = {
  mod: "Ctrl",
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  meta: "Win",
};

const KEY_DISPLAY_LABELS: Readonly<Record<string, string>> = {
  escape: "Esc",
  delete: "Del",
  backspace: "Backspace",
  enter: "Enter",
  space: "Space",
  tab: "Tab",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
};

function splitChord(chord: Chord): { mods: readonly Modifier[]; key: string } {
  const tokens = chord.split("+");
  const key = tokens[tokens.length - 1] ?? "";
  return { mods: tokens.slice(0, -1).filter(isModifier), key };
}

function displayKey(key: string): string {
  if (key.length === 1) return key.toUpperCase();
  return KEY_DISPLAY_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/** Human-readable label — "⇧⌘K" on Mac (HIG order, no separator), "Ctrl+Shift+K" elsewhere. */
export function formatChord(chord: Chord, platform: ChordPlatform = detectChordPlatform()): string {
  const { mods, key } = splitChord(chord);
  if (platform === "mac") {
    const ordered = MAC_DISPLAY_ORDER.filter((m) => mods.includes(m));
    return ordered.map((m) => MAC_MODIFIER_SYMBOLS[m]).join("") + displayKey(key);
  }
  return [...mods.map((m) => OTHER_MODIFIER_LABELS[m]), displayKey(key)].join("+");
}

const ARIA_KEY_NAMES: Readonly<Record<string, string>> = {
  escape: "Escape",
  delete: "Delete",
  backspace: "Backspace",
  enter: "Enter",
  space: "Space",
  tab: "Tab",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
};

/** `aria-keyshortcuts` value per the ARIA spec — "Control+Shift+K", "Meta+K". */
export function toAriaKeyshortcuts(
  chord: Chord,
  platform: ChordPlatform = detectChordPlatform()
): string {
  const { mods, key } = splitChord(chord);
  const modifierNames = mods.map((m) => {
    if (m === "mod") return platform === "mac" ? "Meta" : "Control";
    if (m === "ctrl") return "Control";
    if (m === "alt") return "Alt";
    if (m === "shift") return "Shift";
    return "Meta";
  });
  const keyName = key.length === 1 ? key.toUpperCase() : (ARIA_KEY_NAMES[key] ?? key);
  return [...modifierNames, keyName].join("+");
}
