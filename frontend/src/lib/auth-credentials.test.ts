import { describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import { Wallet } from "ethers";
import { authorizeEmailPassword, authorizeInstitution } from "./auth-credentials";
import { prisma } from "@/lib/prisma";
import type { IssuerStatus } from "@prisma/client";

async function createCredentialsUser(overrides: { email: string; password: string; verified: boolean }) {
  return prisma.user.create({
    data: {
      name: "Credentials User",
      email: overrides.email,
      passwordHash: await bcrypt.hash(overrides.password, 4),
      emailVerified: overrides.verified ? new Date() : null,
      role: "USER",
    },
  });
}

const INSTITUTION_PASSWORD = "Institution@123";
const SIGN_IN_MESSAGE = "Sign in to VeriCred as an institution";

/**
 * An approved institution: a verified contact account plus the Issuer row,
 * and the private key for the registered on-chain wallet so tests can
 * produce genuine signatures for it.
 */
async function createInstitution(
  email: string,
  options: { status?: IssuerStatus; verified?: boolean } = {}
) {
  const orgWallet = Wallet.createRandom();
  const status = options.status ?? "APPROVED";
  const user = await prisma.user.create({
    data: {
      name: "Example University",
      email,
      passwordHash: await bcrypt.hash(INSTITUTION_PASSWORD, 4),
      emailVerified: options.verified === false ? null : new Date(),
      // Approval is what flips the role — see the approve route.
      role: status === "APPROVED" ? "ISSUER" : "USER",
    },
  });
  const issuer = await prisma.issuer.create({
    data: {
      userId: user.id,
      organizationName: "Example University",
      walletAddress: orgWallet.address.toLowerCase(),
      status,
    },
  });
  return { user, issuer, orgWallet };
}

async function sign(wallet: Wallet | ReturnType<typeof Wallet.createRandom>, message = SIGN_IN_MESSAGE) {
  return { message, signature: await wallet.signMessage(message) };
}

describe("authorizeEmailPassword", () => {
  it("refuses to sign in an account whose email has never been verified", async () => {
    await createCredentialsUser({
      email: "unverified@example.test",
      password: "Password@123",
      verified: false,
    });

    await expect(
      authorizeEmailPassword("unverified@example.test", "Password@123")
    ).rejects.toMatchObject({ code: "EmailNotVerified" });
  });

  it("signs in an account once its email is verified", async () => {
    const user = await createCredentialsUser({
      email: "verified@example.test",
      password: "Password@123",
      verified: true,
    });

    await expect(authorizeEmailPassword("verified@example.test", "Password@123")).resolves.toMatchObject({
      id: user.id,
      email: "verified@example.test",
      role: "USER",
    });
  });

  it("returns null without hinting why for a wrong password", async () => {
    await createCredentialsUser({
      email: "wrong-password@example.test",
      password: "Password@123",
      verified: true,
    });

    await expect(authorizeEmailPassword("wrong-password@example.test", "nope")).resolves.toBeNull();
  });

  it("refuses an institution trying to bypass the wallet requirement via the plain form", async () => {
    await createInstitution("bypass@example.edu");

    await expect(
      authorizeEmailPassword("bypass@example.edu", INSTITUTION_PASSWORD)
    ).rejects.toMatchObject({ code: "InstitutionMustUseWallet" });
  });
});

describe("authorizeInstitution", () => {
  it("signs in an approved institution presenting both its password and its wallet signature", async () => {
    const { user, orgWallet } = await createInstitution("both@example.edu");
    const { message, signature } = await sign(orgWallet);

    await expect(
      authorizeInstitution({
        email: "both@example.edu",
        password: INSTITUTION_PASSWORD,
        message,
        signature,
      })
    ).resolves.toMatchObject({ id: user.id, role: "ISSUER" });
  });

  it("refuses a correct password with no wallet signature at all", async () => {
    await createInstitution("no-signature@example.edu");

    await expect(
      authorizeInstitution({ email: "no-signature@example.edu", password: INSTITUTION_PASSWORD })
    ).rejects.toMatchObject({ code: "InstitutionWalletRequired" });
  });

  it("refuses a signature from a wallet that isn't the institution's registered one", async () => {
    await createInstitution("wrong-wallet@example.edu");
    const impostor = Wallet.createRandom();
    const { message, signature } = await sign(impostor);

    await expect(
      authorizeInstitution({
        email: "wrong-wallet@example.edu",
        password: INSTITUTION_PASSWORD,
        message,
        signature,
      })
    ).rejects.toMatchObject({ code: "InstitutionWalletMismatch" });
  });

  it("refuses a correct wallet signature with the wrong password", async () => {
    const { orgWallet } = await createInstitution("wrong-password@example.edu");
    const { message, signature } = await sign(orgWallet);

    await expect(
      authorizeInstitution({
        email: "wrong-password@example.edu",
        password: "not-the-password",
        message,
        signature,
      })
    ).resolves.toBeNull();
  });

  it("refuses an institution whose registration is still pending approval", async () => {
    const { orgWallet } = await createInstitution("pending@example.edu", { status: "PENDING" });
    const { message, signature } = await sign(orgWallet);

    await expect(
      authorizeInstitution({
        email: "pending@example.edu",
        password: INSTITUTION_PASSWORD,
        message,
        signature,
      })
    ).rejects.toMatchObject({ code: "InstitutionPending" });
  });

  it("refuses an institution whose registration was rejected", async () => {
    const { orgWallet } = await createInstitution("rejected@example.edu", { status: "REJECTED" });
    const { message, signature } = await sign(orgWallet);

    await expect(
      authorizeInstitution({
        email: "rejected@example.edu",
        password: INSTITUTION_PASSWORD,
        message,
        signature,
      })
    ).rejects.toMatchObject({ code: "InstitutionRejected" });
  });

  it("still enforces email verification on the institution's contact account", async () => {
    const { orgWallet } = await createInstitution("unverified@example.edu", { verified: false });
    const { message, signature } = await sign(orgWallet);

    await expect(
      authorizeInstitution({
        email: "unverified@example.edu",
        password: INSTITUTION_PASSWORD,
        message,
        signature,
      })
    ).rejects.toMatchObject({ code: "EmailNotVerified" });
  });

  it("refuses a plain user account that has no institution profile", async () => {
    await createCredentialsUser({
      email: "just-a-user@example.test",
      password: "Password@123",
      verified: true,
    });
    const { message, signature } = await sign(Wallet.createRandom());

    await expect(
      authorizeInstitution({
        email: "just-a-user@example.test",
        password: "Password@123",
        message,
        signature,
      })
    ).rejects.toMatchObject({ code: "NotAnInstitution" });
  });
});
