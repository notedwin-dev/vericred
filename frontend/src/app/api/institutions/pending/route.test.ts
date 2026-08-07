import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { buildSession, createUser, mockAuthSession } from "@/test/helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

describe("GET /api/institutions/pending", () => {
  it("is forbidden for non-admins", async () => {
    const user = await createUser({ role: "USER" });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));

    const response = await GET();
    expect(response.status).toBe(403);
  });

  it("lists only PENDING institution requests for an admin", async () => {
    const admin = await createUser({ role: "ADMIN" });
    mockAuthSession(auth, buildSession({ id: admin.id, email: admin.email, role: "ADMIN" }));

    const pendingUser = await prisma.user.create({
      data: { email: "pending-org@example.test", role: "USER" },
    });
    await prisma.issuer.create({
      data: {
        userId: pendingUser.id,
        organizationName: "Pending University",
        walletAddress: "0x1111111111111111111111111111111111111a",
        status: "PENDING",
      },
    });

    const approvedUser = await prisma.user.create({
      data: { email: "approved-org@example.test", role: "ISSUER" },
    });
    await prisma.issuer.create({
      data: {
        userId: approvedUser.id,
        organizationName: "Already Approved University",
        walletAddress: "0x2222222222222222222222222222222222222b",
        status: "APPROVED",
      },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.institutions).toHaveLength(1);
    expect(data.institutions[0].organizationName).toBe("Pending University");
  });
});
