#!/usr/bin/env node
/**
 * Bundle-size gate — enforces ADR-017's 175 kB gzip ceiling on the main
 * chunk (enforcement added by ADR-022 after the ceiling was breached
 * silently at Phase 7 M2: 175.48 kB with a green pipeline).
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
// (react + react-dom + react-aria/stately + router + floating-ui) is ~89 %
// of the chunk; this ceiling's job is catching NEW heavy dependencies and
// unbounded app growth, not relitigating the approved stack.
const CEILING_KB = 190;

const assetsDir = join(process.cwd(), "apps", "web", "dist", "assets");
let entries;
try {
  entries = readdirSync(assetsDir).filter((name) => /^index-.+\.js$/.test(name));
} catch {
  process.stderr.write(`bundle gate: ${assetsDir} not found — run the build first\n`);
  process.exit(1);
}

if (entries.length !== 1) {
  process.stderr.write(
    `bundle gate: expected exactly one index-*.js main chunk, found ${String(entries.length)} ` +
      `(${entries.join(", ")}) — naming scheme changed? Update this script with it.\n`
  );
  process.exit(1);
}

const name = entries[0];
const gzipKb = gzipSync(readFileSync(join(assetsDir, name))).length / 1000;
const summary = `main chunk ${name}: ${gzipKb.toFixed(2)} kB gzip (ceiling ${String(CEILING_KB)} kB, ADR-024)`;

if (gzipKb >= CEILING_KB) {
  process.stderr.write(`bundle gate FAIL — ${summary}\n`);
  process.exit(1);
}
process.stdout.write(`bundle gate OK — ${summary}\n`);
