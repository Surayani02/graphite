#!/usr/bin/env node
/**
 * Bundle-size gate — enforces the gzip ceiling on the main thread's
 * startup JavaScript (ADR-017 ceiling; enforcement added by ADR-022 after
 * a silent breach at Phase 7 M2: 175.48 kB with a green pipeline;
 * recalibrated to 190 kB by ADR-024).
 *
 * ADR-033 (Phase 8 PC-2) widened the measurement from "the index-*.js
 * chunk" to the ENTRY'S STATIC-IMPORT CLOSURE: the entry chunk plus every
 * chunk it reaches through static `import`/`from` edges, transitively.
 * Code splitting moves modules into separate files; only *dynamic* imports
 * move them off the startup path — so a gate that reads one file could be
 * satisfied by splitting alone, without a single deferred byte. Measuring
 * the closure makes that impossible. Dynamic imports (`import("./x")`)
 * are deliberately outside the closure — deferring them is the point.
 *
 * Scope: the web worker entry is excluded — it parses off the main thread
 * and carries the engine; its budget is the WASM line
 * (check-wasm-size.mjs, ADR-033).
 *
 * Measures with Node's zlib at default level, kB = 1000 bytes. Vite's
 * build reporter (rolldown) prints ~1 % higher for the same file; the
 * ceiling is defined against THIS gate's measurement — the enforced number
 * is the one that decides. Runs in CI immediately after
 * `pnpm turbo run build`; locally via `pnpm check:bundle`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

// 190 kB per ADR-024's recalibration: the measured framework floor
// (react + react-dom + react-aria/stately + router + floating-ui) is the
// bulk of the closure; this ceiling's job is catching NEW heavy
// dependencies and unbounded app growth, not relitigating the approved
// stack. PC-2 measured the closure at 177.71 kB (ADR-033 — flat vs the
// pre-split 177.61 kB single file: the palette's open-latency SLO pins its
// subtree in startup, and shared-chunk gzip overhead offsets the islands'
// deferral; this gate's job is the honest closure, not a lower number).
const CEILING_KB = 190;

const assetsDir = join(process.cwd(), "apps", "web", "dist", "assets");
let names;
try {
  names = readdirSync(assetsDir);
} catch {
  process.stderr.write(`bundle gate: ${assetsDir} not found — run the build first\n`);
  process.exit(1);
}

const entries = names.filter((name) => /^index-.+\.js$/.test(name));
if (entries.length !== 1) {
  process.stderr.write(
    `bundle gate: expected exactly one index-*.js entry chunk, found ${String(entries.length)} ` +
      `(${entries.join(", ")}) — naming scheme changed? Update this script with it.\n`
  );
  process.exit(1);
}

// Static edges only: `from"./x.js"` and bare `import"./x.js"` in the
// emitted (minified) ESM. Dynamic `import("./x.js")` has "(" before the
// quote, so the pattern cannot match it.
const STATIC_EDGE = /(?:from|import)\s*"\.\/([^"]+\.js)"/g;

const closure = [];
const seen = new Set();
const queue = [entries[0]];
while (queue.length > 0) {
  const name = queue.shift();
  if (name === undefined || seen.has(name)) continue;
  seen.add(name);
  let source;
  try {
    source = readFileSync(join(assetsDir, name));
  } catch {
    process.stderr.write(`bundle gate: ${name} is statically imported but missing from dist\n`);
    process.exit(1);
  }
  closure.push({ name, gzipKb: gzipSync(source).length / 1000 });
  for (const match of source.toString("utf8").matchAll(STATIC_EDGE)) {
    const target = match[1];
    if (target !== undefined && !seen.has(target)) queue.push(target);
  }
}

const totalKb = closure.reduce((sum, chunk) => sum + chunk.gzipKb, 0);
const breakdown = closure
  .map((chunk) => `  ${chunk.gzipKb.toFixed(2).padStart(8)} kB  ${chunk.name}`)
  .join("\n");
const summary =
  `startup closure ${totalKb.toFixed(2)} kB gzip across ${String(closure.length)} chunk(s) ` +
  `(ceiling ${String(CEILING_KB)} kB, ADR-024/033)`;

if (totalKb >= CEILING_KB) {
  process.stderr.write(`bundle gate FAIL — ${summary}\n${breakdown}\n`);
  process.exit(1);
}
process.stdout.write(`bundle gate OK — ${summary}\n${breakdown}\n`);
