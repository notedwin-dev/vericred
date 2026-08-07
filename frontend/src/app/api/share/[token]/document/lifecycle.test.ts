import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/contract", () => ({ getReadOnlyContract: vi.fn() }));
vi.mock("@/lib/ipfs", () => ({ fetchFromGateway: vi.fn(), uploadToIPFS: vi.fn() }));

import { GET as openShared } from "./route";
import { GET as listShares, POST as createShare } from "@/app/api/certificates/[id]/share/route";
import { DELETE as withdrawShare } from "@/app/api/certificates/[id]/share/[shareId]/route";
import { GET as downloadOwn } from "@/app/api/certificates/[id]/document/route";
import { auth } from "@/lib/auth";
import { getReadOnlyContract } from "@/lib/contract";
import { fetchFromGateway } from "@/lib/ipfs";
import { prisma } from "@/lib/prisma";
import { encrypt, encryptBuffer, generateContentKey } from "@/lib/crypto";
import { buildSession, createIssuerWithCourse, createUser, jsonRequest, mockAuthSession } from "@/test/helpers";

const PDF = Buffer.from("%PDF-1.7 authoritative document — Grade: First Class Honours");

/**
 * The whole Phase 8 chain, end to end: a holder mints a link, a stranger with
 * no session opens the decrypted document through it, the holder withdraws it,
 * and the same link stops working. This is the property that makes sharing a
 * revocable database grant rather than a key hand-off.
 */
describe("share lifecycle", () => {
  it("mints, opens without a session, then genuinely revokes", async () => {
    const { course } = await createIssuerWithCourse();
    const holder = await createUser();
    const credentialId = "VC-2026-LIFECYC1";

    const key = generateContentKey();
    const artifact = encryptBuffer(PDF, key, Buffer.from(credentialId));
    const certificate = await prisma.certificate.create({
      data: {
        credentialId,
        recipientName: "Ada Lovelace",
        courseId: course.id,
        recipientId: holder.id,
        cid: "bafy-cid",
        contentHash: `sha256:${createHash("sha256").update(artifact).digest("hex")}`,
        encKeyEnc: encrypt(key.toString("hex")),
        grade: "First Class Honours",
        status: "ACTIVE",
      },
    });

    vi.mocked(getReadOnlyContract).mockReturnValue({
      verifyCredential: vi.fn().mockResolvedValue([false, false, "", "", 0]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(fetchFromGateway).mockResolvedValue(artifact);

    // 1. The holder mints a link.
    mockAuthSession(auth, buildSession({ id: holder.id, role: "USER" }));
    const created = await (
      await createShare(
        jsonRequest(`http://localhost/api/certificates/${certificate.id}/share`, {
          method: "POST",
          body: { expiresInDays: 30 },
        }),
        { params: Promise.resolve({ id: certificate.id }) }
      )
    ).json();
    expect(created.share.token).toBeTruthy();

    // 2. It shows in their list.
    const listed = await (
      await listShares(new NextRequest("http://localhost/x"), {
        params: Promise.resolve({ id: certificate.id }),
      })
    ).json();
    expect(listed.shares).toHaveLength(1);

    // 3. A stranger with no session opens the real document.
    mockAuthSession(auth, null);
    const shared = await openShared(new NextRequest("http://localhost/x"), {
      params: Promise.resolve({ token: created.share.token }),
    });
    expect(shared.status).toBe(200);
    expect(Buffer.from(await shared.arrayBuffer()).equals(PDF)).toBe(true);

    // ...and that same stranger still cannot reach the owner-only download.
    const denied = await downloadOwn(new NextRequest("http://localhost/x"), {
      params: Promise.resolve({ id: certificate.id }),
    });
    expect(denied.status).toBe(401);

    // 4. The holder withdraws it.
    mockAuthSession(auth, buildSession({ id: holder.id, role: "USER" }));
    expect(
      (
        await withdrawShare(new NextRequest("http://localhost/x"), {
          params: Promise.resolve({ id: certificate.id, shareId: created.share.id }),
        })
      ).status
    ).toBe(200);

    // 5. The link is dead, and gone from the list.
    mockAuthSession(auth, null);
    const afterRevoke = await openShared(new NextRequest("http://localhost/x"), {
      params: Promise.resolve({ token: created.share.token }),
    });
    expect(afterRevoke.status).toBe(410);

    mockAuthSession(auth, buildSession({ id: holder.id, role: "USER" }));
    const relisted = await (
      await listShares(new NextRequest("http://localhost/x"), {
        params: Promise.resolve({ id: certificate.id }),
      })
    ).json();
    expect(relisted.shares).toHaveLength(0);
  }, 30000);

  it("counts views, so a holder can see a link has been used", async () => {
    const { course } = await createIssuerWithCourse();
    const holder = await createUser();
    const credentialId = "VC-2026-VIEWS001";
    const key = generateContentKey();
    const artifact = encryptBuffer(PDF, key, Buffer.from(credentialId));
    const certificate = await prisma.certificate.create({
      data: {
        credentialId,
        recipientName: "Ada Lovelace",
        courseId: course.id,
        recipientId: holder.id,
        cid: "bafy-cid",
        contentHash: `sha256:${createHash("sha256").update(artifact).digest("hex")}`,
        encKeyEnc: encrypt(key.toString("hex")),
        status: "ACTIVE",
      },
    });

    vi.mocked(getReadOnlyContract).mockReturnValue({
      verifyCredential: vi.fn().mockResolvedValue([false, false, "", "", 0]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(fetchFromGateway).mockResolvedValue(artifact);

    mockAuthSession(auth, buildSession({ id: holder.id, role: "USER" }));
    const created = await (
      await createShare(
        jsonRequest(`http://localhost/api/certificates/${certificate.id}/share`, {
          method: "POST",
          body: {},
        }),
        { params: Promise.resolve({ id: certificate.id }) }
      )
    ).json();

    mockAuthSession(auth, null);
    await openShared(new NextRequest("http://localhost/x"), {
      params: Promise.resolve({ token: created.share.token }),
    });

    // The counter is incremented best-effort after the response is built, so
    // give it a moment rather than racing it.
    await new Promise((r) => setTimeout(r, 300));
    const share = await prisma.certificateShare.findUnique({ where: { id: created.share.id } });
    expect(share?.viewCount).toBe(1);
  }, 30000);
});
