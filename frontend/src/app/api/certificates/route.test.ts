import { describe, it, expect, vi } from "vitest";
import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { buildSession, createIssuer, createIssuerWithCourse, createUser, jsonRequest, mockAuthSession } from "@/test/helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

describe("POST /api/certificates", () => {
  it("lets an issuer create a certificate for their own course", async () => {
    const { user, course } = await createIssuerWithCourse();
    mockAuthSession(auth, buildSession({ id: user.id, role: "ISSUER" }));

    const request = jsonRequest("http://localhost/api/certificates", {
      method: "POST",
      body: { recipientName: "Ada Lovelace", courseId: course.id },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.certificate.status).toBe("PENDING");
    expect(data.certificate.recipientName).toBe("Ada Lovelace");

    const stored = await prisma.certificate.findUnique({ where: { id: data.certificate.id } });
    expect(stored).not.toBeNull();
  });

  it("refuses to issue into a course owned by a different issuer", async () => {
    const { course } = await createIssuerWithCourse();
    const { user: otherIssuer } = await createIssuer();
    mockAuthSession(auth, buildSession({ id: otherIssuer.id, role: "ISSUER" }));

    const request = jsonRequest("http://localhost/api/certificates", {
      method: "POST",
      body: { recipientName: "Ada Lovelace", courseId: course.id },
    });

    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it("rejects a duplicate credentialId", async () => {
    const { user, course } = await createIssuerWithCourse();
    mockAuthSession(auth, buildSession({ id: user.id, role: "ISSUER" }));

    const body = { recipientName: "Ada Lovelace", courseId: course.id, credentialId: "VC-2026-DUPE0001" };
    const first = await POST(jsonRequest("http://localhost/api/certificates", { method: "POST", body }));
    expect(first.status).toBe(201);

    const second = await POST(jsonRequest("http://localhost/api/certificates", { method: "POST", body }));
    expect(second.status).toBe(409);
  });

  it("rejects unauthenticated requests", async () => {
    mockAuthSession(auth, null);

    const response = await POST(
      jsonRequest("http://localhost/api/certificates", {
        method: "POST",
        body: { recipientName: "Ada Lovelace", courseId: "does-not-matter" },
      })
    );

    expect(response.status).toBe(401);
  });

  it("rejects a plain USER role", async () => {
    const user = await createUser({ role: "USER" });
    mockAuthSession(auth, buildSession({ id: user.id, role: "USER" }));

    const response = await POST(
      jsonRequest("http://localhost/api/certificates", {
        method: "POST",
        body: { recipientName: "Ada Lovelace", courseId: "does-not-matter" },
      })
    );

    expect(response.status).toBe(403);
  });
});
