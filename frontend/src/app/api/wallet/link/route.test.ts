import { describe, it, expect, vi } from "vitest";
import { Wallet } from "ethers";
import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { buildSession, createIssuer, createIssuerWithCourse, createUser, jsonRequest, mockAuthSession } from "@/test/helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

async function signedWallet(message = "Link this wallet to my VeriCred account") {
  const wallet = Wallet.createRandom();
  const signature = await wallet.signMessage(message);
  return { address: wallet.address, message, signature };
}

describe("POST /api/wallet/link", () => {
  it("links a wallet to the current account without creating or switching users", async () => {
    const user = await createUser({ email: "link-me@example.test" });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));
    const { address, message, signature } = await signedWallet();

    const response = await POST(
      jsonRequest("http://localhost", { method: "POST", body: { address, message, signature } })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.user.id).toBe(user.id);
    expect(data.user.walletAddress).toBe(address.toLowerCase());
  });

  it("rejects linking without a wallet signature", async () => {
    const user = await createUser({ email: "no-sig@example.test" });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));
    const { address } = await signedWallet();

    const response = await POST(jsonRequest("http://localhost", { method: "POST", body: { address } }));

    expect(response.status).toBe(400);
  });

  it("refuses to link a wallet already claimed by another account", async () => {
    const owned = await signedWallet();
    await prisma.user.create({ data: { email: "owner@example.test", walletAddress: owned.address.toLowerCase(), role: "USER" } });
    const user = await createUser({ email: "wannabe@example.test" });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));

    const response = await POST(
      jsonRequest("http://localhost", { method: "POST", body: owned })
    );

    expect(response.status).toBe(409);
  });

  it("refuses to link a wallet already registered as an institution's on-chain wallet", async () => {
    const institutionWallet = await signedWallet();
    const { issuer } = await createIssuer();
    await prisma.issuer.update({
      where: { id: issuer.id },
      data: { walletAddress: institutionWallet.address.toLowerCase() },
    });
    const user = await createUser({ email: "wannabe-institution-wallet@example.test" });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));

    const response = await POST(
      jsonRequest("http://localhost", { method: "POST", body: institutionWallet })
    );

    expect(response.status).toBe(409);
  });

  it("backfills a CLAIMED certificate (recipientId already set, no wallet) when the wallet is linked", async () => {
    const { course } = await createIssuerWithCourse();
    const user = await createUser({ email: "claimed-owner@example.test" });
    const certificate = await prisma.certificate.create({
      data: {
        credentialId: "VC-2026-WALLETLINK1",
        recipientName: "Grace Hopper",
        recipientEmail: user.email,
        recipientId: user.id,
        courseId: course.id,
        cid: "bafy-wallet-link-test",
        status: "CLAIMED",
      },
    });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));
    const { address, message, signature } = await signedWallet();

    const response = await POST(
      jsonRequest("http://localhost", { method: "POST", body: { address, message, signature } })
    );
    expect(response.status).toBe(200);

    const updated = await prisma.certificate.findUnique({ where: { id: certificate.id } });
    expect(updated?.walletAddress).toBe(address.toLowerCase());
  });
});
