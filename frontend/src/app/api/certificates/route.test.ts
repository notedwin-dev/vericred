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

  it("stores the grade and the encrypted-artifact bookkeeping", async () => {
    const { user, course } = await createIssuerWithCourse();
    mockAuthSession(auth, buildSession({ id: user.id, role: "ISSUER" }));

    const response = await POST(
      jsonRequest("http://localhost/api/certificates", {
        method: "POST",
        body: { recipientName: "Ada Lovelace", courseId: course.id, grade: "First Class Honours" },
      })
    );
    const data = await response.json();
    expect(response.status).toBe(201);

    const stored = await prisma.certificate.findUnique({
      where: { id: data.certificate.id },
      omit: { encKeyEnc: false },
    });
    expect(stored?.grade).toBe("First Class Honours");
    expect(stored?.encKeyEnc).toBeTruthy();
    expect(stored?.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("never returns the wrapped content key in a response body", async () => {
    // The key that decrypts the certificate artifact must not be serialisable
    // out of any route. Enforced by a global omit in lib/prisma.ts, so this
    // guards every issuance path, not just this one.
    const { user, course } = await createIssuerWithCourse();
    mockAuthSession(auth, buildSession({ id: user.id, role: "ISSUER" }));

    const response = await POST(
      jsonRequest("http://localhost/api/certificates", {
        method: "POST",
        body: { recipientName: "Ada Lovelace", courseId: course.id, grade: "Distinction" },
      })
    );
    const data = await response.json();

    expect(data.certificate).not.toHaveProperty("encKeyEnc");
    expect(JSON.stringify(data)).not.toContain("encKeyEnc");
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
