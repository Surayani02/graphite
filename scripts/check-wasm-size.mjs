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
 * ARMED 2026-07-25 at the engine-integration commit — the first build in
 * which lyon actually links into the binary — from a measured
 * post-integration reference build of 64.62 kB gzip (152.14 kB raw).
 * Unlike the JS closure, WASM size is deterministic for a given
 * toolchain, so the margin covers toolchain drift and planned near-term
 * growth rather than measurement noise. See ADR-033 Decision 4 for the
 * derivation and for what should trigger a recalibration ADR.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

// 80 kB gzip against the 64.62 kB measured basis — ~24 % headroom.
// Sized to absorb toolchain drift (a few per cent across Rust releases)
// and M2's path model, while a genuinely heavy new dependency — a text
// shaper in M4/M5, a boolean-ops library in M3 — cannot land without
// breaching this and forcing the ADR conversation. That is the gate's
// whole purpose; recalibrate by ADR with a measured basis, never by
// quietly editing this number (ADR-024's discipline, ADR-033 §4).
const CEILING_KB = 80;

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
