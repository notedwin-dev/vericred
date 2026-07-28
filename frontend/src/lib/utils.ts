import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { CredentialData } from "@/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Shortens a wallet/contract address to the conventional `0x1234...abcd`
 * form. Returns an empty string for falsy input so it's safe to use
 * directly in JSX without extra guards.
 */
export function formatAddress(address?: string | null, chars = 4): string {
  if (!address) return "";
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Formats a unix timestamp (seconds, as returned by the contract) or a
 * Date/ISO string into a human-readable date-time string.
 */
export function formatTimestamp(
  value: number | string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (value === null || value === undefined || value === "") return "";

  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "number") {
    // Contract timestamps are unix seconds; anything already in
    // millisecond range is passed through untouched.
    date = new Date(value < 1e12 ? value * 1000 : value);
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString(
    "en-US",
    options ?? {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

/**
 * Maps the raw tuple/struct returned by ethers for VeriCred.sol's
 * `Credential` struct (via `getCredential` / `getCredentialsPaged`) into a
 * plain, JSON-serialisable `CredentialData` object. Ethers v6 returns
 * struct results as array-like `Result` objects with both positional and
 * named access, so this normalizes to a plain object with `number` types
 * for timestamps.
 */
export function mapCredential(raw: unknown): CredentialData {
  const r = raw as Record<string, unknown> & unknown[];

  const issuer = String(r.issuer ?? r[0] ?? "");
  const issuedAt = Number(r.issuedAt ?? r[1] ?? 0);
  const revokedAt = Number(r.revokedAt ?? r[2] ?? 0);
  const revoked = Boolean(r.revoked ?? r[3] ?? false);
  const cid = String(r.cid ?? r[4] ?? "");
  const credentialId = String(r.credentialId ?? r[5] ?? "");
  const revocationReason = String(r.revocationReason ?? r[6] ?? "");

  return {
    issuer,
    issuedAt,
    revokedAt,
    revoked,
    cid,
    credentialId,
    revocationReason,
  };
}
