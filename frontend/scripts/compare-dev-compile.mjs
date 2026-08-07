#!/usr/bin/env node
/**
 * Diffs two runs produced by measure-dev-compile.mjs.
 *
 *   node scripts/compare-dev-compile.mjs 01-baseline-webpack-cold 05-after-fix-turbo
 *
 * Prints a per-route before/after table plus totals. Compile time is the
 * headline number: it is the part the code change can actually move, whereas
 * cold wall-clock also contains DB and RPC latency.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const resultsDir = join(dirname(fileURLToPath(import.meta.url)), ".perf-results");

const [beforeLabel, afterLabel] = process.argv.slice(2);

if (!beforeLabel || !afterLabel) {
  console.error("usage: compare-dev-compile.mjs <before-label> <after-label>\n");
  console.error("available runs:");
  for (const f of readdirSync(resultsDir)) {
    console.error("  " + f.replace(/\.json$/, ""));
  }
  process.exit(1);
}

const load = (label) =>
  JSON.parse(readFileSync(join(resultsDir, `${label}.json`), "utf8"));

const before = load(beforeLabel);
const after = load(afterLabel);

const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
const pct = (b, a) =>
  b === 0 ? "n/a" : `${(((a - b) / b) * 100).toFixed(0)}%`;

const afterByRoute = new Map(after.results.map((r) => [r.route, r]));

console.log(
  `\nBEFORE  ${beforeLabel}  (${before.bundler}${before.cold ? ", cold" : ", warm"})`
);
console.log(
  `AFTER   ${afterLabel}  (${after.bundler}${after.cold ? ", cold" : ", warm"})\n`
);

const rows = [
  ["route", "compile before", "compile after", "change"],
  ["-----", "--------------", "-------------", "------"],
];

for (const b of before.results) {
  const a = afterByRoute.get(b.route);
  if (!a) continue;
  rows.push([b.route, secs(b.compileMs), secs(a.compileMs), pct(b.compileMs, a.compileMs)]);
}

rows.push(["-----", "--------------", "-------------", "------"]);
rows.push([
  "TOTAL compile",
  secs(before.totalCompileMs),
  secs(after.totalCompileMs),
  pct(before.totalCompileMs, after.totalCompileMs),
]);
rows.push([
  "boot (ready in)",
  secs(before.readyMs),
  secs(after.readyMs),
  pct(before.readyMs, after.readyMs),
]);

const widths = rows[0].map((_, i) =>
  Math.max(...rows.map((r) => String(r[i]).length))
);
for (const r of rows) {
  console.log(r.map((c, i) => String(c).padEnd(widths[i])).join("  "));
}

// Warm navigation is the other thing the user feels: how long an already
// compiled route takes to respond.
const warmBefore = before.results.reduce((s, r) => s + r.warmMs, 0) / before.results.length;
const warmAfter = after.results.reduce((s, r) => s + r.warmMs, 0) / after.results.length;
console.log(
  `\nmean warm response: ${warmBefore.toFixed(0)}ms -> ${warmAfter.toFixed(0)}ms ` +
    `(${pct(warmBefore, warmAfter)})\n`
);
