import { describe, it, expect, vi } from "vitest";
import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { buildSession, createIssuerWithCourse, createUser, mockAuthSession } from "@/test/helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

async function seedClaimableCertificate(courseId: string, recipientEmail: string, walletAddress: string | null = null) {
  return prisma.certificate.create({
    data: {
      credentialId: `VC-2026-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      recipientName: "Grace Hopper",
      recipientEmail,
      courseId,
      cid: "bafy-claim-test",
      walletAddress,
      status: "PENDING",
    },
  });
}

function claimRequest(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/certificates/[id]/claim", () => {
  it("claims a certificate with no wallet available, ending up CLAIMED", async () => {
    const { course } = await createIssuerWithCourse();
    const user = await createUser({ email: "grace@example.test" });
    const certificate = await seedClaimableCertificate(course.id, "grace@example.test");
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));

    const response = await POST(new Request("http://localhost"), claimRequest(certificate.id));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.certificate.status).toBe("CLAIMED");
    expect(data.certificate.recipientId).toBe(user.id);
  });

  it("records the wallet and stays CLAIMED when auto-anchoring can't complete (no operator wallet provisioned in test env)", async () => {
    const { course } = await createIssuerWithCourse();
    const wallet = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
    const user = await createUser({ email: "grace-wallet@example.test" });
    await prisma.user.update({ where: { id: user.id }, data: { walletAddress: wallet } });
    const certificate = await seedClaimableCertificate(course.id, "grace-wallet@example.test");
    mockAuthSession(
      auth,
      buildSession({ id: user.id, email: user.email, role: "USER", walletAddress: wallet })
    );

    const response = await POST(new Request("http://localhost"), claimRequest(certificate.id));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.certificate.status).toBe("CLAIMED");
    expect(data.certificate.walletAddress).toBe(wallet);
  });

  it("refuses to claim a certificate issued to a different email", async () => {
    const { course } = await createIssuerWithCourse();
    const user = await createUser({ email: "wrong-person@example.test" });
    const certificate = await seedClaimableCertificate(course.id, "grace@example.test");
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));

    const response = await POST(new Request("http://localhost"), claimRequest(certificate.id));

    expect(response.status).toBe(403);
  });

  it("refuses a second claim once already claimed", async () => {
    const { course } = await createIssuerWithCourse();
    const user = await createUser({ email: "grace-dup@example.test" });
    const otherUser = await createUser({ email: "other-dup@example.test" });
    const certificate = await prisma.certificate.create({
      data: {
        credentialId: "VC-2026-DUPCLAIM01",
        recipientName: "Grace Hopper",
        recipientEmail: "grace-dup@example.test",
        recipientId: otherUser.id,
        courseId: course.id,
        status: "CLAIMED",
      },
    });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));

    const response = await POST(new Request("http://localhost"), claimRequest(certificate.id));

    expect(response.status).toBe(409);
  });

  it("returns 404 for a nonexistent certificate", async () => {
    const user = await createUser({ email: "nobody@example.test" });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));

    const response = await POST(new Request("http://localhost"), claimRequest("does-not-exist"));

    expect(response.status).toBe(404);
  });
});
