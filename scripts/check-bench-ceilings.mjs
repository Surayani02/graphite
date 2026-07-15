#!/usr/bin/env node
/* eslint-disable no-console -- CI gate script: stdout IS the interface,
   matching scripts/check-bundle-size.mjs */
/**
 * CI bench-ceilings gate (Phase 7 M3, ADR-023).
 *
 * Walks target/criterion for every fresh estimate Criterion just wrote and
 * compares each mean against benchmarks/ceilings.json. Ceilings are
 * deliberately generous (see the file's _comment): this gate exists to
 * catch order-of-magnitude regressions on noisy shared runners, while the
 * reference-machine history tracks real drift.
 *
 * Names are DISCOVERED, never constructed: Criterion sanitises characters
 * like "::" differently per OS when building directory names, so the only
 * portable identity is the benchmark.json each result directory carries —
 * group_id [+ "/" + function_id] [+ "/" + value_str].
 *
 * Outcomes: breach → exit 1. Bench without a ceiling → warning (new
 * benches surface loudly but don't block until a ceiling is chosen).
 * Ceiling without a bench → info (usually a renamed or removed bench —
 * prune the entry).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath (not URL.pathname) is required for correctness on Windows:
// pathname is always POSIX-shaped ("/E:/graphite/…", with an errant leading
// slash before the drive letter), which path.win32's dirname/join do not
// parse as a drive-rooted path — the corruption compounds through join()
// into a duplicated "E:\E:\…". fileURLToPath is Node's own platform-aware
// converter and is correct on both POSIX and Windows.
const ROOT = dirname(fileURLToPath(import.meta.url));
const CRITERION_DIR = join(ROOT, "..", "target", "criterion");
const CEILINGS_PATH = join(ROOT, "..", "benchmarks", "ceilings.json");

/** Recursively collects every `new/estimates.json` result dir under dir. */
function findEstimates(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const p = join(dir, entry);
    if (!statSync(p).isDirectory()) continue;
    if (entry === "new") {
      try {
        statSync(join(p, "estimates.json"));
        out.push(p);
      } catch {
        /* a "new" dir without estimates — not a result */
      }
    } else if (entry !== "report") {
      findEstimates(p, out);
    }
  }
  return out;
}

function canonicalName(benchmarkJson) {
  const parts = [benchmarkJson.group_id];
  if (benchmarkJson.function_id) parts.push(benchmarkJson.function_id);
  if (benchmarkJson.value_str) parts.push(benchmarkJson.value_str);
  return parts.join("/");
}

let ceilings;
try {
  ceilings = JSON.parse(readFileSync(CEILINGS_PATH, "utf8"));
} catch (err) {
  console.error(`bench gate: cannot read ${CEILINGS_PATH}: ${String(err)}`);
  process.exit(1);
}
delete ceilings._comment;

const resultDirs = findEstimates(CRITERION_DIR);
if (resultDirs.length === 0) {
  console.error(`bench gate: no Criterion results under ${CRITERION_DIR} — run cargo bench first`);
  process.exit(1);
}

const seen = new Set();
const breaches = [];
const unceilinged = [];

for (const dir of resultDirs) {
  let name, meanNs;
  try {
    // benchmark.json lives INSIDE the "new" dir, alongside estimates.json —
    // not one level up. (Got this wrong once already; see the fixture-based
    // test in the delivery notes — this path is now verified against a
    // synthetic tree shaped exactly like Criterion's real output.)
    const bench = JSON.parse(readFileSync(join(dir, "benchmark.json"), "utf8"));
    name = canonicalName(bench);
    meanNs = JSON.parse(readFileSync(join(dir, "estimates.json"), "utf8")).mean.point_estimate;
  } catch (err) {
    console.warn(`bench gate: skipping unreadable result at ${dir}: ${String(err)}`);
    continue;
  }
  seen.add(name);
  const entry = ceilings[name];
  if (entry === undefined) {
    unceilinged.push(name);
    continue;
  }
  const status = meanNs <= entry.ceiling_ns ? "OK   " : "BREACH";
  console.log(
    `bench gate: ${status} ${name} — mean ${Math.round(meanNs).toLocaleString("en-US")} ns / ceiling ${entry.ceiling_ns.toLocaleString("en-US")} ns`
  );
  if (meanNs > entry.ceiling_ns) breaches.push({ name, meanNs, entry });
}

for (const name of unceilinged) {
  console.warn(
    `bench gate: WARNING — "${name}" has no ceiling in benchmarks/ceilings.json (add one, with its basis)`
  );
}
for (const name of Object.keys(ceilings)) {
  if (!seen.has(name)) {
    console.log(
      `bench gate: info — ceiling "${name}" matched no benchmark this run (renamed or removed?)`
    );
  }
}

if (breaches.length > 0) {
  console.error(`\nbench gate: ${String(breaches.length)} ceiling breach(es):`);
  for (const b of breaches) {
    console.error(
      `  ${b.name}: ${Math.round(b.meanNs).toLocaleString("en-US")} ns > ${b.entry.ceiling_ns.toLocaleString("en-US")} ns (basis: ${b.entry.basis})`
    );
  }
  process.exit(1);
}
console.log(
  `bench gate: OK — ${String(seen.size)} benchmarks, ${String(Object.keys(ceilings).length)} ceilings, 0 breaches`
);
