export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || "31337");
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";
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
