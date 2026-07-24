#!/usr/bin/env node
/**
 * WASM-size gate — the engine binary's budget line alongside ADR-024's JS
 * ceiling (ADR-031 required it as a Phase 8 precondition; mechanism and
 * arming rule recorded in ADR-033).
 *
 * Measures gzip of the wasm-pack output with Node's zlib at default level,
 * kB = 1000 bytes — same measurement convention as check-bundle-size.mjs;
 * the enforced number is the one THIS gate computes.
 *
 * CAPTURE MODE: `CEILING_KB = null` ships with the gate. The container
 * this repo is developed in cannot build the WASM (no Rust toolchain), so
 * the ceiling cannot be set from an invented number — it is armed in the
 * geometry-crate commit from two CI-measured points this script prints:
 * the pre-lyon binary (the first CI run after this commit) and the
 * post-lyon binary (the geometry-crate CI run), per ADR-033. Until then
 * the gate measures, prints loudly, and passes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

// null = capture mode (see header). Armed with a measured basis in the
// geometry-crate commit — ADR-033 records the derivation rule.
const CEILING_KB = null;

const wasmPath = join(
  process.cwd(),
  "packages",
  "engine",
  "pkg",
  "graphite_engine_bg.wasm"
);

let bytes;
try {
  bytes = readFileSync(wasmPath);
} catch {
  process.stderr.write(`wasm gate: ${wasmPath} not found — build the engine first\n`);
  process.exit(1);
}

const rawKb = bytes.length / 1000;
const gzipKb = gzipSync(bytes).length / 1000;
const measured = `graphite_engine_bg.wasm: ${gzipKb.toFixed(2)} kB gzip (${rawKb.toFixed(2)} kB raw)`;

if (CEILING_KB === null) {
  process.stdout.write(
    `wasm gate CAPTURE MODE — ${measured}\n` +
      `wasm gate: no ceiling armed yet; record this measurement — the ceiling is set\n` +
      `wasm gate: from the measured pre/post-lyon pair in the geometry-crate commit (ADR-033).\n`
  );
  process.exit(0);
}

const summary = `${measured} — ceiling ${String(CEILING_KB)} kB (ADR-033)`;
if (gzipKb >= CEILING_KB) {
  process.stderr.write(`wasm gate FAIL — ${summary}\n`);
  process.exit(1);
}
process.stdout.write(`wasm gate OK — ${summary}\n`);
