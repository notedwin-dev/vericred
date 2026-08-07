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

describe("POST /api/institutions/[id]/reject", () => {
  it("is forbidden for non-admins", async () => {
    const user = await createUser({ role: "USER" });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));
    const { issuer } = await createPendingInstitution("reject-forbidden@example.test");

    const response = await POST(
      jsonRequest("http://localhost", { method: "POST", body: { reason: "not legitimate" } }),
      { params: Promise.resolve({ id: issuer.id }) }
    );
    expect(response.status).toBe(403);
  });

  it("rejects a pending institution with a mandatory reason, no role change", async () => {
    const admin = await createUser({ role: "ADMIN" });
    mockAuthSession(auth, buildSession({ id: admin.id, email: admin.email, role: "ADMIN" }));
    const { user, issuer } = await createPendingInstitution("reject-me@example.test");

    const response = await POST(
      jsonRequest("http://localhost", { method: "POST", body: { reason: "Could not verify institution" } }),
      { params: Promise.resolve({ id: issuer.id }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.issuer.status).toBe("REJECTED");

    const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updatedUser?.role).toBe("USER");

    const updatedIssuer = await prisma.issuer.findUnique({ where: { id: issuer.id } });
    expect(updatedIssuer?.rejectionReason).toBe("Could not verify institution");
  });

  it("requires a non-empty reason", async () => {
    const admin = await createUser({ role: "ADMIN" });
    mockAuthSession(auth, buildSession({ id: admin.id, email: admin.email, role: "ADMIN" }));
    const { issuer } = await createPendingInstitution("reject-no-reason@example.test");

    const response = await POST(
      jsonRequest("http://localhost", { method: "POST", body: { reason: "" } }),
      { params: Promise.resolve({ id: issuer.id }) }
    );
    expect(response.status).toBe(400);
  });

  it("refuses to reject an institution that isn't PENDING", async () => {
    const admin = await createUser({ role: "ADMIN" });
    mockAuthSession(auth, buildSession({ id: admin.id, email: admin.email, role: "ADMIN" }));
    const { issuer } = await createPendingInstitution("reject-already-approved@example.test");
    await prisma.issuer.update({ where: { id: issuer.id }, data: { status: "APPROVED" } });

    const response = await POST(
      jsonRequest("http://localhost", { method: "POST", body: { reason: "too late" } }),
      { params: Promise.resolve({ id: issuer.id }) }
    );
    expect(response.status).toBe(409);
  });
});
