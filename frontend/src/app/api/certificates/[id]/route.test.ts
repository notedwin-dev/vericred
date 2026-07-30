import { describe, it, expect, vi } from "vitest";
import { PATCH } from "./route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { buildSession, createIssuer, createIssuerWithCourse, jsonRequest, mockAuthSession } from "@/test/helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

async function seedCertificate(courseId: string) {
  return prisma.certificate.create({
    data: {
      credentialId: `VC-2026-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      recipientName: "Ada Lovelace",
      courseId,
      status: "PENDING",
    },
  });
}

function patchRequest(id: string, reason: unknown) {
  return {
    request: jsonRequest(`http://localhost/api/certificates/${id}`, { method: "PATCH", body: { reason } }),
    params: Promise.resolve({ id }),
  };
}

describe("PATCH /api/certificates/[id]", () => {
  it("lets the owning issuer revoke a certificate with a reason", async () => {
    const { user, course } = await createIssuerWithCourse();
    const certificate = await seedCertificate(course.id);
    mockAuthSession(auth, buildSession({ id: user.id, role: "ISSUER" }));

    const { request, params } = patchRequest(certificate.id, "Issued in error");
    const response = await PATCH(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.certificate.status).toBe("REVOKED");
    expect(data.certificate.revocationReason).toBe("Issued in error");
    expect(data.certificate.revokedAt).not.toBeNull();
  });

  it("refuses to revoke an already-revoked certificate", async () => {
    const { user, course } = await createIssuerWithCourse();
    const certificate = await seedCertificate(course.id);
    mockAuthSession(auth, buildSession({ id: user.id, role: "ISSUER" }));

    const first = patchRequest(certificate.id, "First revocation");
    await PATCH(first.request, { params: first.params });

    const second = patchRequest(certificate.id, "Second attempt");
    const response = await PATCH(second.request, { params: second.params });

    expect(response.status).toBe(409);
  });

  it("refuses to let a different issuer revoke someone else's certificate", async () => {
    const { course } = await createIssuerWithCourse();
    const certificate = await seedCertificate(course.id);
    const { user: otherIssuer } = await createIssuer();
    mockAuthSession(auth, buildSession({ id: otherIssuer.id, role: "ISSUER" }));

    const { request, params } = patchRequest(certificate.id, "Not my course");
    const response = await PATCH(request, { params });

    expect(response.status).toBe(403);
  });

  it("rejects an empty reason", async () => {
    const { user, course } = await createIssuerWithCourse();
    const certificate = await seedCertificate(course.id);
    mockAuthSession(auth, buildSession({ id: user.id, role: "ISSUER" }));

    const { request, params } = patchRequest(certificate.id, "   ");
    const response = await PATCH(request, { params });

    expect(response.status).toBe(400);
  });
});
