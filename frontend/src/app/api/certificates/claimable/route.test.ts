import { describe, it, expect, vi } from "vitest";
import { GET } from "./route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { buildSession, createIssuerWithCourse, createUser, mockAuthSession } from "@/test/helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

describe("GET /api/certificates/claimable", () => {
  it("lists a PENDING, unclaimed certificate issued to the session's email", async () => {
    const { course } = await createIssuerWithCourse();
    const user = await createUser({ email: "grace@example.test" });
    await prisma.certificate.create({
      data: {
        credentialId: "VC-2026-CLAIMABLE1",
        recipientName: "Grace Hopper",
        recipientEmail: "GRACE@example.test", // different case, should still match
        courseId: course.id,
        cid: "bafy-claimable",
        status: "PENDING",
      },
    });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.certificates).toHaveLength(1);
    expect(data.certificates[0].credentialId).toBe("VC-2026-CLAIMABLE1");
  });

  it("excludes certificates already claimed by someone else", async () => {
    const { course } = await createIssuerWithCourse();
    const user = await createUser({ email: "grace2@example.test" });
    const otherUser = await createUser({ email: "somebody-else@example.test" });
    await prisma.certificate.create({
      data: {
        credentialId: "VC-2026-ALREADYCLAIMED",
        recipientName: "Grace Hopper",
        recipientEmail: "grace2@example.test",
        recipientId: otherUser.id,
        courseId: course.id,
        status: "CLAIMED",
      },
    });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));

    const response = await GET();
    const data = await response.json();

    expect(data.certificates).toHaveLength(0);
  });

  it("excludes certificates issued to a different email", async () => {
    const { course } = await createIssuerWithCourse();
    const user = await createUser({ email: "grace3@example.test" });
    await prisma.certificate.create({
      data: {
        credentialId: "VC-2026-NOTMINE",
        recipientName: "Someone Else",
        recipientEmail: "someone-else@example.test",
        courseId: course.id,
        status: "PENDING",
      },
    });
    mockAuthSession(auth, buildSession({ id: user.id, email: user.email, role: "USER" }));

    const response = await GET();
    const data = await response.json();

    expect(data.certificates).toHaveLength(0);
  });
});
