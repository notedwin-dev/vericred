/**
 * Blocks until the local Hardhat node answers JSON-RPC, so `npm run dev:fresh`
 * can start the node, deploy, and the frontend in one command without racing.
 *
 * Needed because the frontend's `predev` copies `frontend-config/`, which only
 * exists after `scripts/deploy.js` has run — and deploy itself fails instantly
 * if the node isn't listening yet. Deliberately dependency-free (plain fetch,
 * no `wait-on`) so it works the same on Windows and POSIX shells.
 */
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const TIMEOUT_MS = Number(process.env.WAIT_TIMEOUT_MS || 60_000);
const POLL_INTERVAL_MS = 500;

async function isUp() {
  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    if (!response.ok) return false;
    const body = await response.json();
    return typeof body.result === "string";
  } catch {
    return false;
  }
}

async function main() {
  const deadline = Date.now() + TIMEOUT_MS;
  process.stdout.write(`Waiting for Hardhat node at ${RPC_URL}`);

  while (Date.now() < deadline) {
    if (await isUp()) {
      process.stdout.write(" — up.\n");
      return;
    }
    process.stdout.write(".");
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  process.stdout.write("\n");
  console.error(`Hardhat node did not become reachable at ${RPC_URL} within ${TIMEOUT_MS}ms.`);
  process.exit(1);
}

main();
