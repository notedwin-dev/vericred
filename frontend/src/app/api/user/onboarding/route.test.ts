import { describe, expect, it, vi } from "vitest";
import { Wallet } from "ethers";
import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { buildSession, createIssuer, createUser, jsonRequest, mockAuthSession } from "@/test/helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

async function signedWallet(message = "Link this wallet to my VeriCred account.") {
  const wallet = Wallet.createRandom();
  const signature = await wallet.signMessage(message);
  return { address: wallet.address, message, signature };
}

function onboard(body: Record<string, unknown>) {
  return POST(jsonRequest("http://localhost", { method: "POST", body }));
}

describe("POST /api/user/onboarding", () => {
  it("completes an OAuth account with a username and a signed wallet", async () => {
    const user = await createUser({ role: "USER" });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));
    const { address, message, signature } = await signedWallet();

    const response = await onboard({ username: "New_User", walletAddress: address, message, signature });
    expect(response.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.username).toBe("new_user");
    expect(updated?.walletAddress).toBe(address.toLowerCase());
  });

  it("rejects an unauthenticated request", async () => {
    mockAuthSession(auth, null);
    const { address, message, signature } = await signedWallet();

    const response = await onboard({ username: "someone", walletAddress: address, message, signature });
    expect(response.status).toBe(401);
  });

  it("rejects a username that breaks the format rules", async () => {
    const user = await createUser({ role: "USER" });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));
    const { address, message, signature } = await signedWallet();

    const response = await onboard({ username: "no spaces!", walletAddress: address, message, signature });
    expect(response.status).toBe(400);
  });

  it("rejects a username already taken by someone else", async () => {
    await prisma.user.create({ data: { email: "holder@example.test", username: "taken", role: "USER" } });
    const user = await createUser({ role: "USER" });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));
    const { address, message, signature } = await signedWallet();

    const response = await onboard({ username: "taken", walletAddress: address, message, signature });
    expect(response.status).toBe(409);
  });

  it("refuses to link a wallet without signature proof", async () => {
    const user = await createUser({ role: "USER" });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));
    const { address } = await signedWallet();

    const response = await onboard({ username: "unsigned", walletAddress: address });
    expect(response.status).toBe(400);

    const untouched = await prisma.user.findUnique({ where: { id: user.id } });
    expect(untouched?.username).toBeNull();
  });

  it("refuses a wallet already registered to an institution", async () => {
    const { address, message, signature } = await signedWallet();
    const { issuer } = await createIssuer();
    await prisma.issuer.update({ where: { id: issuer.id }, data: { walletAddress: address.toLowerCase() } });

    const user = await createUser({ role: "USER" });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));

    const response = await onboard({ username: "conflicting", walletAddress: address, message, signature });
    expect(response.status).toBe(409);
  });

  it("leaves the username unchanged when the wallet is rejected", async () => {
    const { address, message, signature } = await signedWallet();
    await prisma.user.create({
      data: { email: "wallet-owner@example.test", walletAddress: address.toLowerCase(), role: "USER" },
    });

    const user = await createUser({ role: "USER" });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));

    const response = await onboard({ username: "atomic", walletAddress: address, message, signature });
    expect(response.status).toBe(409);

    const untouched = await prisma.user.findUnique({ where: { id: user.id } });
    expect(untouched?.username).toBeNull();
  });
});
