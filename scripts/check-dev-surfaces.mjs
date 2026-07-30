#!/usr/bin/env node
/**
 * Dev-surface exclusion gate — ADR-027, extended for the path fixture
 * corpus (ADR-032 §5, invariant D.5-6).
 *
 * Dev-only surfaces sit behind `import.meta.env.DEV`, which the production
 * build folds to `false` — so their bodies and, through tree-shaking, the
 * modules they reference should vanish. "Should" is the problem: that
 * guarantee depends on module-level purity, and it has already broken once.
 * The fixture corpus was a top-level `const` whose entries called
 * functions, which made its module not provably side-effect-free; rollup
 * kept the whole thing, and the geometry shipped to production behind a
 * guard that did nothing. It was caught by grepping the built artifact by
 * hand. This makes that grep a gate.
 *
 * Checks identifiers unique to dev-only code. Message-type strings and
 * bridge method names are deliberately not checked: the `case` label and
 * the postMessage wrapper legitimately survive, and only the handler body
 * and the payload modules matter.
 *
 * Run after `pnpm turbo run build`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const assetsDir = join(process.cwd(), "apps", "web", "dist", "assets");

/** Identifiers that must not appear in any production bundle. */
const FORBIDDEN = [
  // Path fixture corpus (ADR-032 §5) — shape names are unique to it.
  "figure_eight",
  "miter_spikes",
  "donut_evenodd",
  "star_evenodd",
  "polyline_open",
  // Stress-scene generator (ADR-027).
  "buildStressScene",
];

let names;
try {
  names = readdirSync(assetsDir).filter((name) => name.endsWith(".js"));
} catch {
  process.stderr.write(`dev-surface gate: ${assetsDir} not found — run the build first\n`);
  process.exit(1);
}
if (names.length === 0) {
  process.stderr.write("dev-surface gate: no JS assets found — build output looks wrong\n");
  process.exit(1);
}

const breaches = [];
for (const name of names) {
  const source = readFileSync(join(assetsDir, name), "utf8");
  for (const needle of FORBIDDEN) {
    if (source.includes(needle)) breaches.push(`${name}: ${needle}`);
  }
}

if (breaches.length > 0) {
  process.stderr.write(
    `dev-surface gate FAIL — dev-only code reached the production bundle:\n` +
      breaches.map((b) => `  ${b}\n`).join("") +
      `\nUsually module-level work defeating tree-shaking: build the data inside a\n` +
      `function so the module has no top-level side effects.\n`
  );
  process.exit(1);
}
process.stdout.write(
  `dev-surface gate OK — ${String(FORBIDDEN.length)} dev-only identifiers absent from ` +
    `${String(names.length)} production chunk(s)\n`
);
