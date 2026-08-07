import { describe, expect, it } from "vitest";
import { Wallet } from "ethers";
import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { createIssuer, createUser, jsonRequest } from "@/test/helpers";

async function signedWallet(message = "Link this wallet to my VeriCred account") {
  const wallet = Wallet.createRandom();
  const signature = await wallet.signMessage(message);
  return { address: wallet.address, message, signature };
}

describe("POST /api/auth/register/user", () => {
  it("creates a new account with a verified wallet", async () => {
    const { address, message, signature } = await signedWallet();

    const response = await POST(
      jsonRequest("http://localhost", {
        method: "POST",
        body: {
          name: "Ada Lovelace",
          username: "ada_lovelace",
          email: "ada@example.test",
          password: "correct-horse-battery",
          confirmPassword: "correct-horse-battery",
          walletAddress: address,
          message,
          signature,
        },
      })
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.user.username).toBe("ada_lovelace");
    expect(data.user.walletAddress).toBe(address.toLowerCase());

    const stored = await prisma.user.findUnique({ where: { email: "ada@example.test" } });
    expect(stored?.role).toBe("USER");
    expect(stored?.passwordHash).toBeTruthy();
  });

  it("leaves the new account unverified and issues it a verification token", async () => {
    const { address, message, signature } = await signedWallet();

    const response = await POST(
      jsonRequest("http://localhost", {
        method: "POST",
        body: {
          name: "Alan Turing",
          username: "alan",
          email: "alan@example.test",
          password: "correct-horse-battery",
          confirmPassword: "correct-horse-battery",
          walletAddress: address,
          message,
          signature,
        },
      })
    );
    expect(response.status).toBe(201);

    const stored = await prisma.user.findUnique({ where: { email: "alan@example.test" } });
    expect(stored?.emailVerified).toBeNull();

    const token = await prisma.verificationToken.findFirst({ where: { identifier: stored!.id } });
    expect(token).not.toBeNull();
    expect(token!.expires.getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects a password/confirmPassword mismatch", async () => {
    const { address, message, signature } = await signedWallet();
    const response = await POST(
      jsonRequest("http://localhost", {
        method: "POST",
        body: {
          name: "Grace Hopper",
          username: "grace",
          email: "grace@example.test",
          password: "correct-horse-battery",
          confirmPassword: "wrong-confirm",
          walletAddress: address,
          message,
          signature,
        },
      })
    );
    expect(response.status).toBe(400);
  });

  it("rejects a signature that doesn't match the claimed address", async () => {
    const { message, signature } = await signedWallet();
    const someoneElse = Wallet.createRandom();
    const response = await POST(
      jsonRequest("http://localhost", {
        method: "POST",
        body: {
          name: "Grace Hopper",
          username: "grace",
          email: "grace@example.test",
          password: "correct-horse-battery",
          confirmPassword: "correct-horse-battery",
          walletAddress: someoneElse.address,
          message,
          signature,
        },
      })
    );
    expect(response.status).toBe(400);
  });

  it("rejects a duplicate email", async () => {
    await createUser({ email: "taken@example.test" });
    const { address, message, signature } = await signedWallet();
    const response = await POST(
      jsonRequest("http://localhost", {
        method: "POST",
        body: {
          name: "Grace Hopper",
          username: "grace",
          email: "taken@example.test",
          password: "correct-horse-battery",
          confirmPassword: "correct-horse-battery",
          walletAddress: address,
          message,
          signature,
        },
      })
    );
    expect(response.status).toBe(409);
  });

  it("rejects a wallet already registered as an institution's on-chain wallet", async () => {
    const { address, message, signature } = await signedWallet();
    const { issuer } = await createIssuer();
    // Overwrite the helper's random wallet with one we actually control, so
    // the request can carry a genuinely valid signature -- isolating the
    // cross-table conflict check from signature verification.
    await prisma.issuer.update({ where: { id: issuer.id }, data: { walletAddress: address.toLowerCase() } });

    const response = await POST(
      jsonRequest("http://localhost", {
        method: "POST",
        body: {
          name: "Grace Hopper",
          username: "grace",
          email: "grace@example.test",
          password: "correct-horse-battery",
          confirmPassword: "correct-horse-battery",
          walletAddress: address,
          message,
          signature,
        },
      })
    );
    expect(response.status).toBe(409);
  });
});
