import { describe, it, expect, vi } from "vitest";
import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { buildSession, createIssuerWithCourse, createUser, jsonRequest, mockAuthSession } from "@/test/helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

describe("POST /api/wallet/link", () => {
  it("links a wallet to the current account without creating or switching users", async () => {
    const user = await createUser({ email: "link-me@example.test" });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));

    const response = await POST(
      jsonRequest("http://localhost", { method: "POST", body: { address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" } })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.user.id).toBe(user.id);
    expect(data.user.walletAddress).toBe("0x90f79bf6eb2c4f870365e785982e1f101e93b906");
  });

  it("refuses to link a wallet already claimed by another account", async () => {
    const wallet = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
    await prisma.user.create({ data: { email: "owner@example.test", walletAddress: wallet.toLowerCase(), role: "USER" } });
    const user = await createUser({ email: "wannabe@example.test" });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));

    const response = await POST(jsonRequest("http://localhost", { method: "POST", body: { address: wallet } }));

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

    const response = await POST(
      jsonRequest("http://localhost", { method: "POST", body: { address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" } })
    );
    expect(response.status).toBe(200);

    const updated = await prisma.certificate.findUnique({ where: { id: certificate.id } });
    expect(updated?.walletAddress).toBe("0x90f79bf6eb2c4f870365e785982e1f101e93b906");
  });
});
