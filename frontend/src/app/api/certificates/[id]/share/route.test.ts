import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { GET, POST } from "./route";
import { DELETE } from "./[shareId]/route";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildSession, createIssuerWithCourse, createUser, jsonRequest, mockAuthSession } from "@/test/helpers";

async function seedClaimedCertificate() {
  const { user: issuerUser, course } = await createIssuerWithCourse();
  const recipient = await createUser();
  const certificate = await prisma.certificate.create({
    data: {
      credentialId: `VC-2026-SH${Math.floor(Math.random() * 100000)}`,
      recipientName: "Ada Lovelace",
      courseId: course.id,
      recipientId: recipient.id,
      status: "ACTIVE",
    },
  });
  return { certificate, recipient, issuerUser };
}

const listRequest = (id: string) => ({
  request: new NextRequest(`http://localhost/api/certificates/${id}/share`),
  params: Promise.resolve({ id }),
});

const createRequest = (id: string, body: object = {}) => ({
  request: jsonRequest(`http://localhost/api/certificates/${id}/share`, { method: "POST", body }),
  params: Promise.resolve({ id }),
});

describe("POST /api/certificates/[id]/share", () => {
  it("refuses an unauthenticated caller", async () => {
    mockAuthSession(auth, null);
    const { request, params } = createRequest("anything");

    expect((await POST(request, { params })).status).toBe(401);
  });

  it("404s for a certificate that does not exist", async () => {
    const user = await createUser();
    mockAuthSession(auth, buildSession({ id: user.id, role: "USER" }));
    const { request, params } = createRequest("no-such-id");

    expect((await POST(request, { params })).status).toBe(404);
  });

  it("refuses the issuing institution", async () => {
    const { certificate, issuerUser } = await seedClaimedCertificate();
    mockAuthSession(auth, buildSession({ id: issuerUser.id, role: "ISSUER" }));
    const { request, params } = createRequest(certificate.id);

    expect((await POST(request, { params })).status).toBe(403);
  });

  it("returns a share URL pointing at the public landing page", async () => {
    const { certificate, recipient } = await seedClaimedCertificate();
    mockAuthSession(auth, buildSession({ id: recipient.id, role: "USER" }));
    const { request, params } = createRequest(certificate.id);

    const data = await (await POST(request, { params })).json();

    expect(data.share.url).toBe(`http://localhost/s/${data.share.token}`);
    expect(data.share.expiresAt).toBeNull();
  });

  it("honours an expiry in days", async () => {
    const { certificate, recipient } = await seedClaimedCertificate();
    mockAuthSession(auth, buildSession({ id: recipient.id, role: "USER" }));
    const { request, params } = createRequest(certificate.id, { expiresInDays: 7 });

    const data = await (await POST(request, { params })).json();
    const days = (new Date(data.share.expiresAt).getTime() - Date.now()) / 86_400_000;

    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it("rejects a non-numeric expiry", async () => {
    const { certificate, recipient } = await seedClaimedCertificate();
    mockAuthSession(auth, buildSession({ id: recipient.id, role: "USER" }));
    const { request, params } = createRequest(certificate.id, { expiresInDays: "soon" });

    expect((await POST(request, { params })).status).toBe(400);
  });
});

describe("GET /api/certificates/[id]/share", () => {
  it("lists live shares and hides withdrawn ones", async () => {
    const { certificate, recipient } = await seedClaimedCertificate();
    mockAuthSession(auth, buildSession({ id: recipient.id, role: "USER" }));

    const first = await (await POST(...toArgs(createRequest(certificate.id)))).json();
    await POST(...toArgs(createRequest(certificate.id)));

    await DELETE(new NextRequest("http://localhost/x"), {
      params: Promise.resolve({ id: certificate.id, shareId: first.share.id }),
    });

    const { request, params } = listRequest(certificate.id);
    const data = await (await GET(request, { params })).json();

    expect(data.shares).toHaveLength(1);
    expect(data.shares.map((s: { id: string }) => s.id)).not.toContain(first.share.id);
  });

  it("refuses a stranger", async () => {
    const { certificate } = await seedClaimedCertificate();
    const stranger = await createUser();
    mockAuthSession(auth, buildSession({ id: stranger.id, role: "USER" }));
    const { request, params } = listRequest(certificate.id);

    expect((await GET(request, { params })).status).toBe(403);
  });
});

describe("DELETE /api/certificates/[id]/share/[shareId]", () => {
  it("refuses a stranger, so a share cannot be withdrawn by anyone who finds it", async () => {
    const { certificate, recipient } = await seedClaimedCertificate();
    mockAuthSession(auth, buildSession({ id: recipient.id, role: "USER" }));
    const created = await (await POST(...toArgs(createRequest(certificate.id)))).json();

    const stranger = await createUser();
    mockAuthSession(auth, buildSession({ id: stranger.id, role: "USER" }));
    const response = await DELETE(new NextRequest("http://localhost/x"), {
      params: Promise.resolve({ id: certificate.id, shareId: created.share.id }),
    });

    expect(response.status).toBe(403);
  });

  it("refuses a shareId belonging to a different certificate", async () => {
    const a = await seedClaimedCertificate();
    const b = await seedClaimedCertificate();
    mockAuthSession(auth, buildSession({ id: a.recipient.id, role: "USER" }));
    const created = await (await POST(...toArgs(createRequest(a.certificate.id)))).json();

    const response = await DELETE(new NextRequest("http://localhost/x"), {
      params: Promise.resolve({ id: b.certificate.id, shareId: created.share.id }),
    });

    expect(response.status).toBe(404);
  });

  it("is idempotent — withdrawing twice does not error", async () => {
    const { certificate, recipient } = await seedClaimedCertificate();
    mockAuthSession(auth, buildSession({ id: recipient.id, role: "USER" }));
    const created = await (await POST(...toArgs(createRequest(certificate.id)))).json();

    const args = {
      params: Promise.resolve({ id: certificate.id, shareId: created.share.id }),
    };
    expect((await DELETE(new NextRequest("http://localhost/x"), args)).status).toBe(200);
    expect((await DELETE(new NextRequest("http://localhost/x"), args)).status).toBe(200);
  });
});

function toArgs(built: ReturnType<typeof createRequest>) {
  return [built.request, { params: built.params }] as const;
}
