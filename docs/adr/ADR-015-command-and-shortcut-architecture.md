# ADR-015: Command and shortcut architecture

**Status**: Accepted — 2026-07-07 · **Context**: Phase 6, Milestone 4

## Context

Through M3, global keyboard input was an if-chain inside `EngineCanvas`
(V/H/R/O, mod+S, Space-pan, Escape/Delete forwarding). M4 ships a command
palette and remappable shortcuts. Built as separate systems, the palette's
action list and the keydown chain would drift apart — double maintenance,
inconsistent labels, and no substrate for M5's keymap editor or Phase 10's
plugin-contributed commands. VS Code, Figma, Linear, and Raycast all
converged on the same answer: one command registry, multiple surfaces.

## Decision

**1. A command registry is the single source of truth.**
`CommandDescriptor { id, title, category, keywords?, defaultChords?,
enabled?, run(ctx) }` in `features/commands`. Ids (`"area.action"`) are
public API — persisted overrides key on them. `list()` order is contract:
it is the palette's empty-query order and the deterministic collision
tie-breaker. `register()` returns an unregister function — today test
isolation, tomorrow the exact plugin-unload shape. A module singleton is
populated once at shell bootstrap (`ensureBuiltinCommands`, idempotent);
a factory (`createCommandRegistry`) gives tests isolated instances.

**2. Commands receive a dispatch context, never global reach-ins.**
`run(ctx)` gets the same two legal state surfaces panels get (ADR-013 §6):
engine actions from `EngineContext` and UI-intent setters from Zustand,
assembled at dispatch time by `useCommandContext()`. Commands stay pure and
unit-testable with a fake context.

**3. Chords are canonical, platform-portable strings.** Lowercase tokens,
modifiers ordered `mod → ctrl → alt → shift → meta`, exactly one key
(`"mod+shift+k"`, `"r"`). `mod` is the platform-primary modifier (⌘ on
macOS, Ctrl elsewhere) so overrides persist portably across a user's
machines; the secondary modifier keeps its literal name. Keys come from the
layout-aware `e.key` — documented limitation: shifted symbols bind as the
produced character. Display formatting follows platform convention
(HIG-ordered symbols on mac, `Ctrl+Shift+K` elsewhere) and every surface
also mirrors the live chord as `aria-keyshortcuts`.

**4. Resolution and collision policy** (`shortcutMap.ts`). An override
replaces _all_ of a command's defaults — one chord or `null` (explicitly
unbound); an invalid persisted string resolves to unbound rather than
resurrecting a default the user moved away from. Overridden bindings claim
chords before defaults (an explicit choice beats a shipped default); a
shadowed default drops out of _both_ maps so the UI never advertises a
chord that would run something else. The store keeps overrides unique at
write time; builtin-default uniqueness is enforced by test.

**5. One global key owner: `ShortcutProvider`.** Three tiers per keydown:
suppression (editable targets; everything while a modal is open — modals
own their keys via React Aria), gestures (Space-hold pan; Escape forwarded
raw and modifier-agnostically because it cancels in-flight worker drags),
then chord → command dispatch with `preventDefault` only on a hit.
Delete/Backspace changed from raw forwarding to the semantic
`edit.deleteSelection` command — the same `document:delete_selection` path
the M3 context menus use, so every entry point behaves identically. The
worker's raw-key Delete handling remains valid protocol behaviour for any
embedder. New: window `blur` releases a held Space (M3 came back from
Alt-Tab stuck in temporary-pan). Key-repeat still dispatches, matching M3.

**6. react-aria-components 1.19, scoped to ui-core.** The adoption gate
ADR-014 deferred. Three-question test: it exists to provide WAI-ARIA-correct
behavioural primitives with managed focus; it solves searchable-combobox +
modal-dialog semantics (virtual focus via `aria-activedescendant`, focus
trap/restore, announcements) — the highest a11y-risk widgets in the app and
precisely where hand-rolls fail audits; `@floating-ui/react` is
positioning-only and the M2/M3 hand-rolled patterns don't cover
combobox-in-modal composition. ui-core gains `ModalDialog`, `Tabs`, and the
generic `SearchableListBox` (Autocomplete + ListBox — the palette's
interaction core), plus RAC-free `Kbd` and `EmptyState`. **Boundary: RAC is
imported only inside `packages/ui-core`; features consume primitives.**

**7. Remapping ships as a mechanism, not yet a page.** The recorder dialog
(palette → "Change Keyboard Shortcut…") makes "remappable" true in-product:
pick a command, press keys, conflicts shown and reassigned, unbind
supported. Its native `<select>` is deliberate — accessible by default;
the full keymap editor belongs to M5 Settings where React Hook Form + Zod
land. `getAllByRole`-style enumeration, categories, and search over the
keymap arrive there as a form over state that exists today.

## Consequences

**Positive.** Palette and shortcuts cannot drift; every affordance
(tooltips, menu chips, `aria-keyshortcuts`) reflects live bindings; M5's
keymap editor is a form over existing state; Phase 10 plugins contribute
commands through `register()` unchanged; assistive tech always sees real
chords.

**Costs.** Main-bundle delta from RAC: +172.8 kB raw / **+51.9 kB gzip**
(recorded in `docs/benchmarks/phase6-m4.md`). Accepted: it buys audited
combobox/dialog/tabs semantics reused by every future modal and M5's form
surfaces. Watch item: if the main chunk keeps growing, code-split the modal
layer at M5. Two-tier collision semantics carry subtle cases — locked by
`shortcutMap.test.ts`'s six invariants.

## Alternatives considered

Two parallel systems (palette list + keydown chain) — guaranteed drift;
rejected. Zustand-hosted registry — commands are behaviour, not
serialisable intent; violates the state contract. `cmdk`, `fuse.js`,
`hotkeys-js` — each fails the three-question test at this scale (a ~40-line
scorer and ~80-line chord parser are auditable; RAC already provides the
palette interaction core). Raw `@react-aria` hooks — same dependency tree,
more glue for identical semantics. Fully hand-rolled combobox — the M2/M3
menu/tree hand-rolls were tractable, but combobox-in-modal focus
choreography is where hand-rolls reliably fail the audit that gates
Phase 6 exit. Palette as a route — palettes are modal overlays, and routing
lands M5.
