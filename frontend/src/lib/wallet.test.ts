import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { findWalletConflict } from "@/lib/wallet";
import { createIssuer, createUser } from "@/test/helpers";

const ADDRESS = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";

describe("findWalletConflict", () => {
  it("reports no conflict for an unclaimed address", async () => {
    expect(await findWalletConflict(ADDRESS)).toBeNull();
  });

  it("reports a personal account holding the address", async () => {
    const user = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { walletAddress: ADDRESS } });

    expect(await findWalletConflict(ADDRESS)).toEqual({ type: "user", ownerId: user.id });
  });

  it("reports an institution holding the address", async () => {
    const { issuer } = await createIssuer();
    await prisma.issuer.update({ where: { id: issuer.id }, data: { walletAddress: ADDRESS } });

    expect(await findWalletConflict(ADDRESS)).toEqual({ type: "issuer", ownerId: issuer.id });
  });

  it("reports the institution even when a personal account also holds it", async () => {
    // The case that let an institution's on-chain identity be captured by a
    // personal account: callers treat a "user" conflict that is the caller
    // themselves as no conflict at all, so returning the user match first hid
    // the institution collision entirely and the write went through.
    const { issuer } = await createIssuer();
    await prisma.issuer.update({ where: { id: issuer.id }, data: { walletAddress: ADDRESS } });
    const user = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { walletAddress: ADDRESS } });

    expect(await findWalletConflict(ADDRESS)).toEqual({ type: "issuer", ownerId: issuer.id });
  });
});
