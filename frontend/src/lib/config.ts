export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "31337");
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
export const BLOCK_EXPLORER_URL = process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL?.replace(/\/$/, "") || null;

/** Etherscan-style explorer link for a transaction. `null` when no explorer is configured (e.g. local Hardhat). */
export function getExplorerTxUrl(txHash: string): string | null {
  return BLOCK_EXPLORER_URL ? `${BLOCK_EXPLORER_URL}/tx/${txHash}` : null;
}
export const IPFS_GATEWAY = (process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://ipfs.io").replace(/\/$/, "");
export const AVATAR_ORIGIN = new URL(IPFS_GATEWAY).origin;

/** Profile images must come from the configured IPFS gateway — set via /api/user/avatar, not an arbitrary URL. */
export function isAllowedAvatarUrl(url: string): boolean {
  try {
    return new URL(url).origin === AVATAR_ORIGIN;
  } catch {
    return false;
  }
}
