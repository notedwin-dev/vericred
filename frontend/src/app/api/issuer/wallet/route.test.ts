import { describe, expect, it, vi } from "vitest";
import { Wallet } from "ethers";
import { PATCH } from "./route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { buildSession, createUser, jsonRequest, mockAuthSession } from "@/test/helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

async function signedWallet(message = "Update my institution's on-chain wallet") {
  const wallet = Wallet.createRandom();
  const signature = await wallet.signMessage(message);
  return { address: wallet.address, message, signature };
}

async function createApprovedInstitution(email: string) {
  const oldWallet = await signedWallet("original wallet, not used for signing here");
  const user = await prisma.user.create({ data: { email, role: "ISSUER" } });
  const issuer = await prisma.issuer.create({
    data: {
      userId: user.id,
      organizationName: "Approved University",
      walletAddress: oldWallet.address.toLowerCase(),
      status: "APPROVED",
    },
  });
  return { user, issuer, oldWallet };
}

describe("PATCH /api/issuer/wallet", () => {
  it("is forbidden for a user with no Issuer profile", async () => {
    const user = await createUser({ role: "USER" });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));
    const { address, message, signature } = await signedWallet();

    const response = await PATCH(
      jsonRequest("http://localhost", { method: "PATCH", body: { walletAddress: address, message, signature } })
    );
    expect(response.status).toBe(403);
  });

  it("refuses to change the wallet while the institution is still PENDING", async () => {
    const user = await prisma.user.create({ data: { email: "still-pending@example.test", role: "USER" } });
    await prisma.issuer.create({
      data: {
        userId: user.id,
        organizationName: "Not Yet Approved",
        walletAddress: (await signedWallet()).address.toLowerCase(),
        status: "PENDING",
      },
    });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));
    const { address, message, signature } = await signedWallet();

    const response = await PATCH(
      jsonRequest("http://localhost", { method: "PATCH", body: { walletAddress: address, message, signature } })
    );
    expect(response.status).toBe(409);
  });

  it("rejects a new wallet without signature proof", async () => {
    const { user } = await createApprovedInstitution("no-sig-change@example.test");
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "ISSUER" }));
    const { address } = await signedWallet();

    const response = await PATCH(
      jsonRequest("http://localhost", { method: "PATCH", body: { walletAddress: address } })
    );
    expect(response.status).toBe(400);
  });

  it("rejects a new wallet already in use by another account", async () => {
    const { user } = await createApprovedInstitution("conflict-change@example.test");
    const taken = await signedWallet();
    await prisma.user.create({ data: { email: "other-owner@example.test", walletAddress: taken.address.toLowerCase(), role: "USER" } });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "ISSUER" }));

    const response = await PATCH(
      jsonRequest("http://localhost", {
        method: "PATCH",
        body: { walletAddress: taken.address, message: taken.message, signature: taken.signature },
      })
    );
    expect(response.status).toBe(409);
  });

  it("leaves the wallet unchanged when the on-chain re-authorisation fails", async () => {
    const { user, issuer, oldWallet } = await createApprovedInstitution("chain-fails@example.test");
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "ISSUER" }));
    const newWallet = await signedWallet();

    const response = await PATCH(
      jsonRequest("http://localhost", {
        method: "PATCH",
        body: { walletAddress: newWallet.address, message: newWallet.message, signature: newWallet.signature },
      })
    );
    expect(response.status).toBe(500);

    const unchanged = await prisma.issuer.findUnique({ where: { id: issuer.id } });
    expect(unchanged?.walletAddress).toBe(oldWallet.address.toLowerCase());
  });
});
