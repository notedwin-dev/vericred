import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { assertWalletIsNotInstitution, InstitutionMustUseWalletError } from "@/lib/auth-credentials";
import { createIssuer, createUser } from "@/test/helpers";

const ORG_WALLET = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";

describe("assertWalletIsNotInstitution", () => {
  it("allows an ordinary personal wallet", async () => {
    await expect(assertWalletIsNotInstitution(ORG_WALLET)).resolves.toBeUndefined();
  });

  it("refuses an institution's on-chain wallet, so no personal account can capture it", async () => {
    const { issuer } = await createIssuer();
    await prisma.issuer.update({ where: { id: issuer.id }, data: { walletAddress: ORG_WALLET } });

    await expect(assertWalletIsNotInstitution(ORG_WALLET)).rejects.toBeInstanceOf(
      InstitutionMustUseWalletError
    );
  });

  it("still refuses once a personal account has already captured it", async () => {
    // The corrupted state the bug produced: both tables hold the address.
    const { issuer } = await createIssuer();
    await prisma.issuer.update({ where: { id: issuer.id }, data: { walletAddress: ORG_WALLET } });
    const user = await createUser();
    await prisma.user.update({ where: { id: user.id }, data: { walletAddress: ORG_WALLET } });

    await expect(assertWalletIsNotInstitution(ORG_WALLET)).rejects.toBeInstanceOf(
      InstitutionMustUseWalletError
    );
  });
});
