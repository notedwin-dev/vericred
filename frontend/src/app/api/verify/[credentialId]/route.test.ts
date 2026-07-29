import { describe, it, expect, vi } from "vitest";
import { GET } from "./route";
import { getReadOnlyContract } from "@/lib/contract";
import { createIssuerWithCourse } from "@/test/helpers";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

vi.mock("@/lib/contract", () => ({ getReadOnlyContract: vi.fn() }));

function verifyRequest(credentialId: string) {
  return {
    request: new NextRequest(`http://localhost/api/verify/${credentialId}`),
    params: Promise.resolve({ credentialId }),
  };
}

describe("GET /api/verify/[credentialId]", () => {
  it("enriches an existing on-chain credential with off-chain metadata", async () => {
    const { course } = await createIssuerWithCourse();
    const certificate = await prisma.certificate.create({
      data: {
        credentialId: "VC-2026-ONCHAIN01",
        recipientName: "Ada Lovelace",
        courseId: course.id,
        status: "ACTIVE",
      },
    });

    vi.mocked(getReadOnlyContract).mockReturnValue({
      verifyCredential: vi.fn().mockResolvedValue([true, true, "bafy-test-cid", "0xIssuerAddr", 1_700_000_000]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { request, params } = verifyRequest(certificate.credentialId);
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.exists).toBe(true);
    expect(data.onChain).toBe(true);
    expect(data.valid).toBe(true);
    expect(data.cid).toBe("bafy-test-cid");
    expect(data.certificate.recipientName).toBe("Ada Lovelace");
    expect(data.certificate.course.name).toBe(course.name);
  });

  it("reports exists:false for a credential neither the contract nor the database has seen", async () => {
    vi.mocked(getReadOnlyContract).mockReturnValue({
      verifyCredential: vi.fn().mockResolvedValue([false, false, "", "0x0000000000000000000000000000000000000000", 0]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { request, params } = verifyRequest("VC-2026-NEVERISSUED");
    const response = await GET(request, { params });
    const data = await response.json();

    expect(data.exists).toBe(false);
    expect(data.onChain).toBe(false);
    expect(data.valid).toBe(false);
  });

  it("reports exists:true, onChain:false for a certificate issued without a wallet (not yet anchored)", async () => {
    // The bug the user hit: issuing without a recipient wallet leaves the
    // certificate PENDING and off-chain-only (see lib/anchor.ts). It's
    // still a real, publicly viewable record with a real IPFS PDF — not
    // the same as a credentialId nobody has ever issued.
    const { course } = await createIssuerWithCourse();
    const certificate = await prisma.certificate.create({
      data: {
        credentialId: "VC-2026-OFFCHAIN01",
        recipientName: "Ada Lovelace",
        courseId: course.id,
        cid: "bafy-offchain-pdf",
        status: "PENDING",
      },
    });

    vi.mocked(getReadOnlyContract).mockReturnValue({
      verifyCredential: vi.fn().mockResolvedValue([false, false, "", "0x0000000000000000000000000000000000000000", 0]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { request, params } = verifyRequest(certificate.credentialId);
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.exists).toBe(true);
    expect(data.onChain).toBe(false);
    expect(data.valid).toBe(false);
    expect(data.cid).toBe("bafy-offchain-pdf");
    expect(data.certificate.status).toBe("PENDING");
    expect(data.certificate.recipientName).toBe("Ada Lovelace");
  });

  it("reports valid:false when the off-chain record is REVOKED, even if the chain says valid", async () => {
    // Tests the combined verification logic: a certificate revoked off-chain
    // but not yet revoked on-chain should still be reported as invalid,
    // since the off-chain DB status is the source of truth for revocations
    // until the on-chain transaction lands.
    const { course } = await createIssuerWithCourse();
    const certificate = await prisma.certificate.create({
      data: {
        credentialId: "VC-2026-DIVERGED01",
        recipientName: "Ada Lovelace",
        courseId: course.id,
        status: "REVOKED",
        revokedAt: new Date(),
        revocationReason: "Revoked off-chain only, for this test",
      },
    });

    vi.mocked(getReadOnlyContract).mockReturnValue({
      verifyCredential: vi.fn().mockResolvedValue([true, true, "bafy-test-cid", "0xIssuerAddr", 1_700_000_000]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { request, params } = verifyRequest(certificate.credentialId);
    const response = await GET(request, { params });
    const data = await response.json();

    expect(data.onChain).toBe(true);
    expect(data.valid).toBe(false);
    expect(data.certificate.status).toBe("REVOKED");
  });
});
