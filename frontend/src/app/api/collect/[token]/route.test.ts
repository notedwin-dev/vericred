import { describe, it, expect, vi } from "vitest";
import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { buildSession, createIssuerWithCourse, createUser, jsonRequest, mockAuthSession } from "@/test/helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

function claimRequest(token: string, body: unknown = { recipientName: "Grace Hopper" }) {
  return {
    request: jsonRequest(`http://localhost/api/collect/${token}`, { method: "POST", body }),
    params: Promise.resolve({ token }),
  };
}

describe("POST /api/collect/[token]", () => {
  it("lets an authenticated user claim a certificate via an active link", async () => {
    const { course } = await createIssuerWithCourse();
    const link = await prisma.collectionLink.create({ data: { courseId: course.id, token: "active-link" } });
    const recipient = await createUser();
    mockAuthSession(auth, buildSession({ id: recipient.id, role: "USER" }));

    const { request, params } = claimRequest(link.token);
    const response = await POST(request, { params });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.certificate.status).toBe("PENDING");
    expect(data.certificate.recipientId).toBe(recipient.id);

    const updatedLink = await prisma.collectionLink.findUnique({ where: { token: link.token } });
    expect(updatedLink?.currentCount).toBe(1);
  });

  it("refuses a second claim for the same course by the same user", async () => {
    const { course } = await createIssuerWithCourse();
    const link = await prisma.collectionLink.create({ data: { courseId: course.id, token: "dup-link" } });
    const recipient = await createUser();
    mockAuthSession(auth, buildSession({ id: recipient.id, role: "USER" }));

    const first = claimRequest(link.token);
    await POST(first.request, { params: first.params });

    const second = claimRequest(link.token);
    const response = await POST(second.request, { params: second.params });

    expect(response.status).toBe(409);
  });

  it("refuses to claim an expired link", async () => {
    const { course } = await createIssuerWithCourse();
    const link = await prisma.collectionLink.create({
      data: { courseId: course.id, token: "expired-link", linkExpiresAt: new Date(Date.now() - 60_000) },
    });
    const recipient = await createUser();
    mockAuthSession(auth, buildSession({ id: recipient.id, role: "USER" }));

    const { request, params } = claimRequest(link.token);
    const response = await POST(request, { params });

    expect(response.status).toBe(410);
  });

  it("auto-deactivates the link once maxCollections is reached, refusing further claims", async () => {
    const { course } = await createIssuerWithCourse();
    const link = await prisma.collectionLink.create({
      data: { courseId: course.id, token: "capped-link", maxCollections: 1 },
    });
    const firstRecipient = await createUser();
    const secondRecipient = await createUser();

    mockAuthSession(auth, buildSession({ id: firstRecipient.id, role: "USER" }));
    const first = claimRequest(link.token);
    const firstResponse = await POST(first.request, { params: first.params });
    expect(firstResponse.status).toBe(201);

    const afterFirstClaim = await prisma.collectionLink.findUnique({ where: { token: link.token } });
    expect(afterFirstClaim?.active).toBe(false);
    expect(afterFirstClaim?.currentCount).toBe(1);

    mockAuthSession(auth, buildSession({ id: secondRecipient.id, role: "USER" }));
    const second = claimRequest(link.token);
    const secondResponse = await POST(second.request, { params: second.params });

    expect(secondResponse.status).toBe(410);
  });
});
