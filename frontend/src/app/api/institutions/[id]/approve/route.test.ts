import { randomBytes } from "crypto";
import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { buildSession, createUser, jsonRequest, mockAuthSession } from "@/test/helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

async function createPendingInstitution(email: string) {
  const user = await prisma.user.create({ data: { email, role: "USER" } });
  const issuer = await prisma.issuer.create({
    data: {
      userId: user.id,
      organizationName: "Pending University",
      walletAddress: `0x${randomBytes(20).toString("hex")}`,
      status: "PENDING",
    },
  });
  return { user, issuer };
}

describe("POST /api/institutions/[id]/approve", () => {
  it("is forbidden for non-admins", async () => {
    const user = await createUser({ role: "USER" });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));
    const { issuer } = await createPendingInstitution("approve-forbidden@example.test");

    const response = await POST(jsonRequest("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: issuer.id }),
    });
    expect(response.status).toBe(403);
  });

  it("returns 404 for a nonexistent institution", async () => {
    const admin = await createUser({ role: "ADMIN" });
    mockAuthSession(auth, buildSession({ id: admin.id, email: admin.email, role: "ADMIN" }));

    const response = await POST(jsonRequest("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "does-not-exist" }),
    });
    expect(response.status).toBe(404);
  });

  it("refuses to approve an institution that isn't PENDING", async () => {
    const admin = await createUser({ role: "ADMIN" });
    mockAuthSession(auth, buildSession({ id: admin.id, email: admin.email, role: "ADMIN" }));
    const { issuer } = await createPendingInstitution("approve-not-pending@example.test");
    await prisma.issuer.update({ where: { id: issuer.id }, data: { status: "APPROVED" } });

    const response = await POST(jsonRequest("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: issuer.id }),
    });
    expect(response.status).toBe(409);
  });

  it("leaves DB state unchanged when the on-chain authorisation call fails", async () => {
    // No Hardhat node is reachable in this test environment even though
    // ADMIN_PRIVATE_KEY/ENCRYPTION_KEY are configured (see root .env) --
    // exercising the real operator-wallet-provisioning + on-chain-call path
    // up to a genuine network failure, which must never partially apply the
    // approval (docs/institution-registration-prd.md Decision 7:
    // all-or-nothing).
    const admin = await createUser({ role: "ADMIN" });
    mockAuthSession(auth, buildSession({ id: admin.id, email: admin.email, role: "ADMIN" }));
    const { user, issuer } = await createPendingInstitution("approve-no-chain@example.test");

    const response = await POST(jsonRequest("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: issuer.id }),
    });
    expect(response.status).toBe(500);

    const unchangedIssuer = await prisma.issuer.findUnique({ where: { id: issuer.id } });
    expect(unchangedIssuer?.status).toBe("PENDING");
    expect(unchangedIssuer?.operatorAddress).toBeNull();

    const unchangedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(unchangedUser?.role).toBe("USER");
  });
});
