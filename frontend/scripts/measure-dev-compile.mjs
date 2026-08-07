#!/usr/bin/env node
/**
 * Dev-server compile benchmark.
 *
 * Boots `next dev`, requests routes, and records how long each took to
 * compile. Two signals are captured so they corroborate each other:
 *
 *   1. The dev server's own `✓ Compiled /route in 12.3s` stdout lines (sharp,
 *      compilation only).
 *   2. Wall-clock time-to-first-byte for the request that triggered it (blunt,
 *      but it is what the developer actually waits through).
 *
 * Each route is requested a second time for a warm number; cold-minus-warm
 * isolates compilation from data fetching, which matters because several
 * routes hit Postgres and the chain RPC.
 *
 * Modes:
 *   (default)  All routes against one server. Fast, but the first route pays
 *              for the whole shared graph and later routes only pay their
 *              delta — good for totals, misleading per route.
 *   --isolate  A fresh server per route, so each number answers "I opened
 *              this page first, how long did I wait?". ~6x slower to run,
 *              but this is the number to hold against a budget.
 *
 * Usage:
 *   node scripts/measure-dev-compile.mjs --label baseline --cold
 *   node scripts/measure-dev-compile.mjs --label after --turbopack --isolate
 */

import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const resultsDir = join(__dirname, ".perf-results");

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const useTurbopack = flag("turbopack");
const cold = flag("cold");
const isolate = flag("isolate");
const label = value("label", useTurbopack ? "turbopack" : "webpack");
const port = Number(value("port", "3123"));
const BUDGET_MS = Number(value("budget", "3000"));

/**
 * A representative spread rather than every route: the landing page, the two
 * heaviest client pages (wallet + form), a public server-rendered page, and
 * two routes behind the authenticated layout. The authenticated ones redirect
 * to /login when unauthenticated, but Next compiles the whole route segment
 * before the layout can redirect, which is what we are timing.
 */
const DEFAULT_ROUTES = [
  "/",
  "/login",
  "/register/user",
  "/verify",
  "/dashboard",
  "/issuer",
];

// --routes /dashboard,/issuer  narrows the run when probing a single fix.
const ROUTES = value("routes", "")
  ? value("routes", "").split(",").map((r) => r.trim()).filter(Boolean)
  : DEFAULT_ROUTES;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;]*[a-zA-Z]/g, "");
}

/** Parses `✓ Compiled /dashboard in 12.3s (1234 modules)` and its variants. */
function parseCompileLine(line) {
  const m = stripAnsi(line).match(
    /Compiled\s+(\/\S*|\S+)\s+in\s+([\d.]+)(ms|s)/i
  );
  if (!m) return null;
  const [, route, num, unit] = m;
  return { route, ms: unit === "s" ? parseFloat(num) * 1000 : parseFloat(num) };
}

async function waitForReady(proc, log) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (log.text.includes("Ready in") || /- Local:\s+http/.test(log.text)) {
      return;
    }
    if (proc.exitCode !== null) {
      throw new Error(
        `dev server exited early (code ${proc.exitCode})\n${stripAnsi(log.text).slice(-800)}`
      );
    }
    await sleep(250);
  }
  throw new Error("dev server never became ready within 180s");
}

async function timedFetch(url) {
  const start = performance.now();
  try {
    const res = await fetch(url, { redirect: "manual" });
    await res.arrayBuffer().catch(() => {});
    return { ms: performance.now() - start, status: res.status };
  } catch (err) {
    return { ms: performance.now() - start, status: 0, error: String(err) };
  }
}

function killTree(proc) {
  if (proc.exitCode !== null) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    proc.kill("SIGTERM");
  }
}

function clearNextDir() {
  const nextDir = join(projectRoot, ".next");
  if (existsSync(nextDir)) {
    rmSync(nextDir, { recursive: true, force: true });
    console.log("[bench] removed .next");
  }
}

/** Boots one dev server, measures the given routes against it, then kills it. */
async function runServer(routes, serverPort, { verbose = false } = {}) {
  const log = { text: "" };
  const compileEvents = [];

  const nextArgs = ["next", "dev", "--port", String(serverPort)];
  if (useTurbopack) nextArgs.push("--turbopack");

  const bootStart = performance.now();
  const proc = spawn("npx", nextArgs, {
    cwd: projectRoot,
    shell: true,
    env: { ...process.env, FORCE_COLOR: "0" },
  });

  const onData = (buf) => {
    const chunk = buf.toString();
    log.text += chunk;
    for (const line of chunk.split("\n")) {
      const parsed = parseCompileLine(line);
      if (parsed) compileEvents.push({ ...parsed, at: performance.now() });
    }
    if (verbose) process.stdout.write(stripAnsi(chunk).replace(/^/gm, "  | "));
  };
  proc.stdout.on("data", onData);
  proc.stderr.on("data", onData);

  const out = [];
  try {
    await waitForReady(proc, log);
    const readyMs = performance.now() - bootStart;

    for (const route of routes) {
      const before = compileEvents.length;
      const c = await timedFetch(`http://localhost:${serverPort}${route}`);
      // The final compile line can land a beat after the response.
      await sleep(400);
      const compileMs = compileEvents
        .slice(before)
        .reduce((sum, e) => sum + e.ms, 0);
      const w = await timedFetch(`http://localhost:${serverPort}${route}`);
      out.push({
        route,
        coldMs: Math.round(c.ms),
        warmMs: Math.round(w.ms),
        compileMs: Math.round(compileMs),
        status: c.status,
      });
    }
    return { results: out, readyMs };
  } finally {
    killTree(proc);
    await sleep(1500);
  }
}

function writeResults(results, readyMs) {
  const payload = {
    label,
    bundler: useTurbopack ? "turbopack" : "webpack",
    cold,
    isolate,
    budgetMs: BUDGET_MS,
    readyMs,
    timestamp: new Date().toISOString(),
    results,
    totalColdMs: results.reduce((s, r) => s + r.coldMs, 0),
    totalCompileMs: results.reduce((s, r) => s + r.compileMs, 0),
    overBudget: results.filter((r) => r.compileMs >= BUDGET_MS).map((r) => r.route),
  };
  mkdirSync(resultsDir, { recursive: true });
  const out = join(resultsDir, `${label}.json`);
  writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log(
    `\n[bench] boot ${(readyMs / 1000).toFixed(1)}s | ` +
      `total compile ${(payload.totalCompileMs / 1000).toFixed(1)}s | ` +
      `over ${BUDGET_MS}ms: ${payload.overBudget.length}/${results.length}` +
      (payload.overBudget.length ? ` -> ${payload.overBudget.join(", ")}` : "")
  );
  console.log(`[bench] wrote ${out}`);
}

async function main() {
  console.log(
    `[bench] ${label} | ${useTurbopack ? "turbopack" : "webpack"}` +
      `${cold ? " | cold" : ""}${isolate ? " | isolate" : ""}`
  );

  if (cold) clearNextDir();

  if (isolate) {
    const results = [];
    let readySum = 0;
    for (const [i, route] of ROUTES.entries()) {
      // Turbopack keeps no on-disk cache, so a fresh boot is already a cold
      // compile. Only webpack needs .next cleared between routes.
      if (cold && !useTurbopack) clearNextDir();
      const r = await runServer([route], port + i);
      readySum += r.readyMs;
      const row = r.results[0];
      results.push(row);
      console.log(
        `[bench] ${route.padEnd(16)} compile=${(row.compileMs / 1000).toFixed(1)}s  ` +
          `ttfb=${(row.coldMs / 1000).toFixed(1)}s  ` +
          `${row.compileMs >= BUDGET_MS ? "OVER BUDGET" : "ok"}`
      );
    }
    writeResults(results, Math.round(readySum / ROUTES.length));
    return;
  }

  const { results, readyMs } = await runServer(ROUTES, port, { verbose: true });
  for (const r of results) {
    console.log(
      `[bench] ${r.route.padEnd(16)} cold=${(r.coldMs / 1000).toFixed(1)}s  ` +
        `warm=${(r.warmMs / 1000).toFixed(2)}s  ` +
        `compile=${(r.compileMs / 1000).toFixed(1)}s  (${r.status})`
    );
  }
  writeResults(results, Math.round(readyMs));
}

main().catch((err) => {
  console.error("[bench] failed:", err);
  process.exit(1);
});
