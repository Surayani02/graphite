# Phase 6 accessibility audit

**Milestone**: M5 (phase exit gate) · **Date**: 2026-07-08

Phase 6 cannot close without this audit (Blueprint §Accessibility). It has
two halves: an automated gate that runs in CI on every push, and a manual
protocol executed on the reference machine. Automated tooling catches
machine-detectable failures — roughly a third of WCAG — so the manual pass
is not optional.

## Automated (CI, every push)

`apps/web/e2e/a11y.spec.ts` runs axe-core (`wcag2a`, `wcag2aa`, `wcag21a`,
`wcag21aa`) across route × theme:

| Surface                | Theme | Gate               |
| ---------------------- | ----- | ------------------ |
| Editor `/`             | dark  | 0 serious/critical |
| Editor `/`             | light | 0 serious/critical |
| Settings `/settings`   | dark  | 0 serious/critical |
| Command palette (open) | dark  | 0 serious/critical |

The gate is zero **serious or critical** violations; moderate/minor are
reviewed but not blocking. Forced-colors rendering is smoke-tested
separately (`theme.spec.ts`) — the shell must remain visible and operable
under `forced-colors: active`.

> **Reference run — 2026-07-15** (reference machine, tree = `f94d1c5` +
> Phase 7 M2.5 applied, first full Playwright pass on real hardware):
> all four rows **passed** — editor/dark 1.8 s, editor/light 1.9 s,
> settings/dark 1.1 s, palette/dark 1.4 s — zero serious/critical
> violations. Forced-colors smoke (`theme.spec.ts`) passed in the same run.
> The gate has run in CI on every push since Phase 6 M5; this entry records
> its first execution on the environment the targets are defined against.

## Manual protocol (reference machine)

Executed on Windows 11 (the project dev environment). Record outcomes inline.

### Keyboard-only walkthrough (no pointer)

1. **Tab order** through the editor: toolbar Save → tools rail (single stop)
   → left panel tabs → layer tree (single stop) → inspector fields. Every
   stop reachable, focus ring always visible.
2. **Tools rail**: arrow keys rove Select/Pan/Rectangle/Ellipse; the active
   tool is the only tab stop (roving tabindex).
3. **Layer tree**: Arrow up/down across selectable rows, Home/End jump,
   Enter/Space select; frames are skipped; `aria-activedescendant` tracks
   the active row.
4. **Command palette**: mod+K opens with focus in the search field; type to
   filter; Arrow/Enter navigate and execute; Escape clears then closes.
5. **Shortcut recorder**: reachable from the palette; the capture field
   accepts a chord; Escape/Tab retain their meaning (dismiss / move focus),
   not captured as bindings.
6. **Settings**: mod+K → nothing (route has no shortcuts); Tab reaches the
   theme radios (arrow-key roving) and the keymap search + rows; the back
   link returns to the editor.

### Screen reader smoke (NVDA + Chrome)

Confirm announcements: dialog role + name on palette/recorder open; listbox
option count and active option in the palette; tab names and selected state
in the left panel; radio group name/value in appearance; tree item
selection in layers. `aria-keyshortcuts` announced on tool buttons and Save.

### Contrast (all three modes)

Verify content/surface pairs meet WCAG AA (4.5:1 text, 3:1 UI) in dark and
light using the DevTools contrast checker; confirm forced-colors uses system
pairs (CanvasText on Canvas, actionable elements on Highlight). Record any
token that fails and the fix.

## Findings and fixes

| #   | Surface                     | Severity | Finding                                        | Resolution |
| --- | --------------------------- | -------- | ---------------------------------------------- | ---------- |
| 1   | All four automated surfaces | —        | None — 0 serious/critical (2026-07-15 ref run) | n/a        |

> The **manual protocol** above (keyboard-only walkthrough, NVDA smoke,
> contrast check) has not yet been executed and recorded — automated
> tooling covers roughly a third of WCAG, so this remains an open Phase 6
> exit item, queued for the reference machine (~20 minutes).

Fixes discovered here are committed before Phase 6 closes; this table is the
record that the exit criterion (zero unresolved serious findings) was met.
