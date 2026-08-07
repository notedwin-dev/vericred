import { Contract, JsonRpcProvider, Wallet, type InterfaceAbi, type Signer } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config";

// `abi.json` starts life as an empty array (see src/lib/abi.json) and is
// overwritten by `scripts/copy-config.js` (run via the `predev` hook) once a
// contract has actually been deployed. Guard the import so the app doesn't
// crash before that has happened.
let abi: InterfaceAbi = [];
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  abi = require("./abi.json");
} catch {
  abi = [];
}

/**
 * Validates that CONTRACT_ADDRESS and ABI are properly configured.
 * Throws descriptive errors if either is missing.
 */
function validateContractConfig(): void {
  if (!CONTRACT_ADDRESS) {
    throw new Error(
      "NEXT_PUBLIC_CONTRACT_ADDRESS is not set. Deploy the contract and run the copy-config script, or set it in your .env file."
    );
  }
  if (!abi || abi.length === 0) {
    throw new Error(
      "Contract ABI is empty. Run `npm run predev` (or deploy the contract) to populate src/lib/abi.json."
    );
  }
}

/**
 * Read-only contract instance backed by a JSON-RPC provider. Safe to use in
 * server components, route handlers, and anywhere else that only needs to
 * call view/pure functions (e.g. `verifyCredential`).
 */
export function getReadOnlyContract(): Contract {
  validateContractConfig();

  const provider = new JsonRpcProvider(RPC_URL);
  return new Contract(CONTRACT_ADDRESS!, abi, provider);
}

/**
 * Contract instance connected to a signer, for state-changing calls
 * (issuing/revoking credentials, authorising institutions, etc.). The signer
 * is expected to come from a connected wallet (e.g. `BrowserProvider`) on the
 * client, or a server-side wallet for privileged/backend-driven flows.
 */
export function getSignerContract(signer: Signer): Contract {
  validateContractConfig();

  return new Contract(CONTRACT_ADDRESS!, abi, signer);
}

/**
 * Server-side wallet signing as the platform admin, for backend-driven
 * privileged calls (authorising/removing institutions). Returns null if
 * `ADMIN_PRIVATE_KEY` isn't configured — callers should treat that as
 * "admin-only actions are unavailable," not throw.
 */
export function getAdminSigner(): Wallet | null {
  const privateKey = process.env.ADMIN_PRIVATE_KEY;
  if (!privateKey) return null;
  const provider = new JsonRpcProvider(RPC_URL);
  return new Wallet(privateKey, provider);
}
