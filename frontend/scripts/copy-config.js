/**
 * Copies deployment output produced by `scripts/deploy.js` (at the repo
 * root) into the Next.js app: the contract ABI goes to `src/lib/abi.json`,
 * and NEXT_PUBLIC_* values are merged into `.env.local`.
 *
 * Run automatically before `next dev` via the `predev` npm script. Designed
 * to no-op gracefully (never throw) when the contract hasn't been deployed
 * yet, so a fresh checkout can still run `npm run dev`.
 */
const fs = require("fs");
const path = require("path");

const FRONTEND_DIR = path.join(__dirname, "..");
const REPO_ROOT = path.join(FRONTEND_DIR, "..");
const CONFIG_DIR = path.join(REPO_ROOT, "frontend-config");
const CONTRACT_JSON = path.join(CONFIG_DIR, "contract.json");
const CONFIG_ENV_LOCAL = path.join(CONFIG_DIR, ".env.local");
const ABI_OUT = path.join(FRONTEND_DIR, "src", "lib", "abi.json");
const ENV_LOCAL_OUT = path.join(FRONTEND_DIR, ".env.local");

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function parseEnvFile(content) {
  const vars = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    vars[key] = value;
  }
  return vars;
}

function serializeEnv(vars) {
  return (
    Object.entries(vars)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n"
  );
}

/** Merges `updates` into the existing `.env.local`, preserving other keys. */
function mergeEnvLocal(updates) {
  let existing = {};
  if (fs.existsSync(ENV_LOCAL_OUT)) {
    existing = parseEnvFile(fs.readFileSync(ENV_LOCAL_OUT, "utf8"));
  }
  const merged = { ...existing, ...updates };
  fs.writeFileSync(ENV_LOCAL_OUT, serializeEnv(merged));
}

function main() {
  // 1. Extract the ABI, so `src/lib/contract.ts` has something to import.
  const contract = readJson(CONTRACT_JSON);
  if (!contract || !contract.abi) {
    console.warn(
      "[copy-config] frontend-config/contract.json not found (or missing an `abi` field). " +
        "Deploy the contract first with `npx hardhat run scripts/deploy.js --network localhost`. Skipping ABI copy."
    );
  } else {
    fs.mkdirSync(path.dirname(ABI_OUT), { recursive: true });
    fs.writeFileSync(ABI_OUT, JSON.stringify(contract.abi, null, 2) + "\n");
    console.log(`[copy-config] Wrote ABI (${contract.abi.length} entries) to src/lib/abi.json`);
  }

  // 2. Merge NEXT_PUBLIC_* env vars into frontend/.env.local.
  let envUpdates = null;

  if (fs.existsSync(CONFIG_ENV_LOCAL)) {
    envUpdates = parseEnvFile(fs.readFileSync(CONFIG_ENV_LOCAL, "utf8"));
  } else if (contract) {
    // Fall back to deriving them straight from contract.json if the
    // convenience .env.local wasn't written for some reason.
    envUpdates = {
      NEXT_PUBLIC_CONTRACT_ADDRESS: contract.address,
      NEXT_PUBLIC_CHAIN_ID: contract.chainId,
      NEXT_PUBLIC_RPC_URL: "http://127.0.0.1:8545",
    };
  }

  if (!envUpdates) {
    console.warn(
      "[copy-config] No frontend-config/.env.local or contract.json found. Skipping env var copy."
    );
    return;
  }

  mergeEnvLocal(envUpdates);
  console.log(
    `[copy-config] Merged ${Object.keys(envUpdates).length} env var(s) into frontend/.env.local`
  );
}

main();
