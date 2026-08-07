import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/contract", () => ({ getReadOnlyContract: vi.fn() }));
vi.mock("@/lib/ipfs", () => ({ fetchFromGateway: vi.fn(), uploadToIPFS: vi.fn() }));

import { GET } from "./route";
import { DELETE } from "@/app/api/certificates/[id]/share/[shareId]/route";
import { POST } from "@/app/api/certificates/[id]/share/route";
import { auth } from "@/lib/auth";
import { getReadOnlyContract } from "@/lib/contract";
import { fetchFromGateway } from "@/lib/ipfs";
import { prisma } from "@/lib/prisma";
import { encrypt, encryptBuffer, generateContentKey } from "@/lib/crypto";
import { buildSession, createIssuerWithCourse, createUser, jsonRequest, mockAuthSession } from "@/test/helpers";

const PDF = Buffer.from("%PDF-1.7 the shared certificate, grade included");

function chainSilent() {
  vi.mocked(getReadOnlyContract).mockReturnValue({
    verifyCredential: vi.fn().mockResolvedValue([false, false, "", "", 0]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

async function seedShareableCertificate() {
  const { course } = await createIssuerWithCourse();
  const recipient = await createUser();
  const credentialId = `VC-2026-SHR${Math.floor(Math.random() * 10000)}`;
  const key = generateContentKey();
  const artifact = encryptBuffer(PDF, key, Buffer.from(credentialId));

  const certificate = await prisma.certificate.create({
    data: {
      credentialId,
      recipientName: "Ada Lovelace",
      courseId: course.id,
      recipientId: recipient.id,
      cid: "bafy-cid",
      contentHash: `sha256:${createHash("sha256").update(artifact).digest("hex")}`,
      encKeyEnc: encrypt(key.toString("hex")),
      grade: "First Class Honours",
      status: "ACTIVE",
    },
  });

  return { certificate, recipient, artifact };
}

async function mintShare(certificateId: string, recipientId: string, body: object = {}) {
  mockAuthSession(auth, buildSession({ id: recipientId, role: "USER" }));
  const response = await POST(
    jsonRequest(`http://localhost/api/certificates/${certificateId}/share`, {
      method: "POST",
      body,
    }),
    { params: Promise.resolve({ id: certificateId }) }
  );
  return { response, data: await response.json() };
}

function shareRequest(token: string) {
  return {
    request: new NextRequest(`http://localhost/api/share/${token}/document`),
    params: Promise.resolve({ token }),
  };
}

describe("certificate sharing", () => {
  it("lets the holder mint a link that opens the document without an account", async () => {
    const { certificate, recipient, artifact } = await seedShareableCertificate();
    const { response: mintResponse, data } = await mintShare(certificate.id, recipient.id);
    expect(mintResponse.status).toBe(201);
    expect(data.share.url).toContain(`/s/${data.share.token}`);

    // No session at all from here on — this is the employer's view.
    mockAuthSession(auth, null);
    chainSilent();
    vi.mocked(fetchFromGateway).mockResolvedValue(artifact);

    const { request, params } = shareRequest(data.share.token);
    const response = await GET(request, { params });
    const body = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(body.equals(PDF)).toBe(true);
  });

  it("never puts key material in the share link", async () => {
    // The whole reason sharing is a database grant rather than a key hand-off.
    const { certificate, recipient } = await seedShareableCertificate();
    const { data } = await mintShare(certificate.id, recipient.id);

    const stored = await prisma.certificate.findUnique({
      where: { id: certificate.id },
      omit: { encKeyEnc: false },
    });
    expect(data.share.token).not.toContain(stored!.encKeyEnc);
    expect(JSON.stringify(data)).not.toContain("encKeyEnc");
    expect(JSON.stringify(data)).not.toContain(stored!.encKeyEnc);
  });

  it("stops working once the holder withdraws it", async () => {
    const { certificate, recipient, artifact } = await seedShareableCertificate();
    const { data } = await mintShare(certificate.id, recipient.id);
    chainSilent();
    vi.mocked(fetchFromGateway).mockResolvedValue(artifact);

    mockAuthSession(auth, buildSession({ id: recipient.id, role: "USER" }));
    const revoked = await DELETE(new NextRequest("http://localhost/x"), {
      params: Promise.resolve({ id: certificate.id, shareId: data.share.id }),
    });
    expect(revoked.status).toBe(200);

    mockAuthSession(auth, null);
    const { request, params } = shareRequest(data.share.token);
    const response = await GET(request, { params });

    expect(response.status).toBe(410);
  });

  it("refuses an expired share", async () => {
    const { certificate, recipient } = await seedShareableCertificate();
    const { data } = await mintShare(certificate.id, recipient.id);
    await prisma.certificateShare.update({
      where: { id: data.share.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    mockAuthSession(auth, null);
    const { request, params } = shareRequest(data.share.token);

    expect((await GET(request, { params })).status).toBe(410);
  });

  it("refuses an unknown token", async () => {
    mockAuthSession(auth, null);
    const { request, params } = shareRequest("not-a-real-token");

    expect((await GET(request, { params })).status).toBe(404);
  });

  it("will not let a stranger mint a share for someone else's certificate", async () => {
    const { certificate } = await seedShareableCertificate();
    const stranger = await createUser();
    const { response } = await mintShare(certificate.id, stranger.id);

    expect(response.status).toBe(403);
  });

  it("rejects an out-of-range expiry", async () => {
    const { certificate, recipient } = await seedShareableCertificate();
    const { response } = await mintShare(certificate.id, recipient.id, { expiresInDays: 4000 });

    expect(response.status).toBe(400);
  });
});
