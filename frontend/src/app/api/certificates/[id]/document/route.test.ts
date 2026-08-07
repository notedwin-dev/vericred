import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/contract", () => ({ getReadOnlyContract: vi.fn() }));
vi.mock("@/lib/ipfs", () => ({ fetchFromGateway: vi.fn(), uploadToIPFS: vi.fn() }));

import { GET } from "./route";
import { auth } from "@/lib/auth";
import { getReadOnlyContract } from "@/lib/contract";
import { fetchFromGateway } from "@/lib/ipfs";
import { prisma } from "@/lib/prisma";
import { encrypt, encryptBuffer, generateContentKey } from "@/lib/crypto";
import { createHash } from "node:crypto";
import { buildSession, createIssuerWithCourse, createUser, mockAuthSession } from "@/test/helpers";

function documentRequest(id: string) {
  return {
    request: new NextRequest(`http://localhost/api/certificates/${id}/document`),
    params: Promise.resolve({ id }),
  };
}

function chainSilent() {
  vi.mocked(getReadOnlyContract).mockReturnValue({
    verifyCredential: vi.fn().mockResolvedValue([false, false, "", "", 0]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/** Creates a certificate whose artifact is a real encrypted PDF. */
async function seedEncryptedCertificate(courseId: string, recipientId?: string) {
  const credentialId = `VC-2026-DOC${Math.floor(Math.random() * 10000)}`;
  const pdf = Buffer.from("%PDF-1.7 the authoritative document, grade included");
  const key = generateContentKey();
  const artifact = encryptBuffer(pdf, key, Buffer.from(credentialId));

  const certificate = await prisma.certificate.create({
    data: {
      credentialId,
      recipientName: "Ada Lovelace",
      courseId,
      recipientId,
      cid: "bafy-cid",
      contentHash: `sha256:${createHash("sha256").update(artifact).digest("hex")}`,
      encKeyEnc: encrypt(key.toString("hex")),
      grade: "First Class Honours",
      status: "ACTIVE",
    },
  });

  return { certificate, artifact, pdf };
}

describe("GET /api/certificates/[id]/document", () => {
  it("refuses an unauthenticated request", async () => {
    mockAuthSession(auth, null);
    const { request, params } = documentRequest("anything");

    expect((await GET(request, { params })).status).toBe(401);
  });

  it("refuses a signed-in user who is not the recipient, issuer or an admin", async () => {
    const { course } = await createIssuerWithCourse();
    const { certificate } = await seedEncryptedCertificate(course.id);
    const stranger = await createUser();
    mockAuthSession(auth, buildSession({ id: stranger.id, role: "USER" }));
    chainSilent();

    const { request, params } = documentRequest(certificate.id);
    expect((await GET(request, { params })).status).toBe(403);
  });

  it("gives the recipient their decrypted certificate", async () => {
    const { course } = await createIssuerWithCourse();
    const recipient = await createUser();
    const { certificate, artifact, pdf } = await seedEncryptedCertificate(course.id, recipient.id);
    mockAuthSession(auth, buildSession({ id: recipient.id, role: "USER" }));
    chainSilent();
    vi.mocked(fetchFromGateway).mockResolvedValue(artifact);

    const { request, params } = documentRequest(certificate.id);
    const response = await GET(request, { params });
    const body = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.equals(pdf)).toBe(true);
  });

  it("gives the owning issuer the same document", async () => {
    const { user, course } = await createIssuerWithCourse();
    const { certificate, artifact } = await seedEncryptedCertificate(course.id);
    mockAuthSession(auth, buildSession({ id: user.id, role: "ISSUER" }));
    chainSilent();
    vi.mocked(fetchFromGateway).mockResolvedValue(artifact);

    const { request, params } = documentRequest(certificate.id);
    expect((await GET(request, { params })).status).toBe(200);
  });

  it("regenerates a pre-encryption certificate without calling the gateway", async () => {
    const { course } = await createIssuerWithCourse();
    const recipient = await createUser();
    const certificate = await prisma.certificate.create({
      data: {
        credentialId: "VC-2026-LEGACY01",
        recipientName: "Ada Lovelace",
        courseId: course.id,
        recipientId: recipient.id,
        cid: "bafy-plaintext-legacy",
        status: "ACTIVE",
      },
    });
    mockAuthSession(auth, buildSession({ id: recipient.id, role: "USER" }));
    chainSilent();
    vi.mocked(fetchFromGateway).mockReset();

    const { request, params } = documentRequest(certificate.id);
    const response = await GET(request, { params });
    const body = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("x-vericred-source")).toBe("regenerated");
    expect(body.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(vi.mocked(fetchFromGateway)).not.toHaveBeenCalled();
  });

  it("fails loudly rather than serving a re-render when the stored bytes are wrong", async () => {
    // Silently falling back would hide exactly the tampering this detects.
    const { course } = await createIssuerWithCourse();
    const recipient = await createUser();
    const { certificate } = await seedEncryptedCertificate(course.id, recipient.id);
    mockAuthSession(auth, buildSession({ id: recipient.id, role: "USER" }));
    chainSilent();
    vi.mocked(fetchFromGateway).mockResolvedValue(Buffer.from("VCE1 substituted content"));

    const { request, params } = documentRequest(certificate.id);
    const response = await GET(request, { params });

    expect(response.status).toBe(502);
  });
});
