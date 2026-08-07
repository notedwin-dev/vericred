import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { revokeCertificateOnChain } from "./revoke";
import { getAdminSigner, getReadOnlyContract, getSignerContract } from "@/lib/contract";
import { getOperatorSigner } from "@/lib/operator-wallet";
import { createIssuerWithCourse } from "@/test/helpers";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/contract", () => ({
  getReadOnlyContract: vi.fn(),
  getSignerContract: vi.fn(),
  getAdminSigner: vi.fn(),
}));
vi.mock("@/lib/operator-wallet", () => ({ getOperatorSigner: vi.fn() }));

const OPERATOR = "0x1111111111111111111111111111111111111111";
const OWN_WALLET = "0x2222222222222222222222222222222222222222";

/** A contract stub whose revokeCredential resolves to a receipt. */
function revokingContract(txHash = "0xdeadbeef") {
  return {
    revokeCredential: vi.fn().mockResolvedValue({
      hash: txHash,
      wait: vi.fn().mockResolvedValue({ hash: txHash }),
    }),
  };
}

async function seedAnchoredCertificate(courseId: string, txHash: string | null = "0xanchored") {
  return prisma.certificate.create({
    data: {
      credentialId: `VC-2026-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      recipientName: "Ada Lovelace",
      courseId,
      status: txHash ? "ACTIVE" : "PENDING",
      txHash,
    },
  });
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("revokeCertificateOnChain", () => {
  it("skips a certificate that was never anchored, without touching the chain", async () => {
    const { course } = await createIssuerWithCourse();
    const certificate = await seedAnchoredCertificate(course.id, null);

    const result = await revokeCertificateOnChain(certificate, "Issued in error");

    expect(result).toEqual({ status: "skipped", reason: "not-anchored" });
    expect(getReadOnlyContract).not.toHaveBeenCalled();
  });

  it("skips when the chain has no record under this credential id", async () => {
    const { course } = await createIssuerWithCourse();
    const certificate = await seedAnchoredCertificate(course.id);
    // The shape ethers surfaces for the contract's own CredentialNotFound revert.
    vi.mocked(getReadOnlyContract).mockReturnValue({
      getCredential: vi.fn().mockRejectedValue(
        new Error(
          `execution reverted (unknown custom error) reason="CredentialNotFound(\"${certificate.credentialId}\")"`
        )
      ),
    } as never);

    const result = await revokeCertificateOnChain(certificate, "Issued in error");

    expect(result).toEqual({ status: "skipped", reason: "not-anchored" });
  });

  it("reports a failure, not 'not-anchored', when the chain cannot be read at all", async () => {
    // An RPC outage must never be mistaken for "there is nothing to revoke" —
    // that would silently downgrade a revocation to off-chain-only.
    const { course } = await createIssuerWithCourse();
    const certificate = await seedAnchoredCertificate(course.id);
    vi.mocked(getReadOnlyContract).mockReturnValue({
      getCredential: vi.fn().mockRejectedValue(new Error("could not detect network")),
    } as never);

    const result = await revokeCertificateOnChain(certificate, "Issued in error");

    expect(result).toEqual({ status: "failed", message: "could not detect network" });
    expect(getSignerContract).not.toHaveBeenCalled();
  });

  it("does not throw when the admin signer cannot be constructed", async () => {
    // getAdminSigner builds a Wallet from ADMIN_PRIVATE_KEY and throws on a
    // malformed key. The documented contract is that this function never throws.
    const { course } = await createIssuerWithCourse();
    const certificate = await seedAnchoredCertificate(course.id);
    vi.mocked(getReadOnlyContract).mockReturnValue({
      getCredential: vi.fn().mockResolvedValue({ issuer: OWN_WALLET, revoked: false }),
    } as never);
    vi.mocked(getAdminSigner).mockImplementation(() => {
      throw new Error("invalid private key");
    });

    const result = await revokeCertificateOnChain(certificate, "Issued in error");

    expect(result).toEqual({ status: "failed", message: "invalid private key" });
  });

  it("is idempotent — reports a skip rather than reverting on an already-revoked credential", async () => {
    const { course } = await createIssuerWithCourse();
    const certificate = await seedAnchoredCertificate(course.id);
    vi.mocked(getReadOnlyContract).mockReturnValue({
      getCredential: vi.fn().mockResolvedValue({ issuer: OPERATOR, revoked: true }),
    } as never);

    const result = await revokeCertificateOnChain(certificate, "Issued in error");

    expect(result).toEqual({ status: "skipped", reason: "already-revoked" });
    expect(getSignerContract).not.toHaveBeenCalled();
  });

  it("signs with the issuer's operator wallet when that wallet anchored the credential", async () => {
    const { issuer, course } = await createIssuerWithCourse();
    await prisma.issuer.update({ where: { id: issuer.id }, data: { operatorAddress: OPERATOR } });
    const certificate = await seedAnchoredCertificate(course.id);

    vi.mocked(getReadOnlyContract).mockReturnValue({
      getCredential: vi.fn().mockResolvedValue({ issuer: OPERATOR, revoked: false }),
    } as never);
    const operatorSigner = { address: OPERATOR };
    vi.mocked(getOperatorSigner).mockReturnValue(operatorSigner as never);
    const contract = revokingContract("0xrevoked");
    vi.mocked(getSignerContract).mockReturnValue(contract as never);

    const result = await revokeCertificateOnChain(certificate, "Awarded in error");

    expect(result).toEqual({ status: "revoked", txHash: "0xrevoked" });
    expect(getSignerContract).toHaveBeenCalledWith(operatorSigner);
    expect(getAdminSigner).not.toHaveBeenCalled();
    expect(contract.revokeCredential).toHaveBeenCalledWith(certificate.credentialId, "Awarded in error");
  });

  it("falls back to the admin signer when the credential was anchored by the institution's own wallet", async () => {
    // The platform never holds that key, so only admin's override authority
    // can revoke an interactively-anchored credential server-side.
    const { issuer, course } = await createIssuerWithCourse();
    await prisma.issuer.update({ where: { id: issuer.id }, data: { operatorAddress: OPERATOR } });
    const certificate = await seedAnchoredCertificate(course.id);

    vi.mocked(getReadOnlyContract).mockReturnValue({
      getCredential: vi.fn().mockResolvedValue({ issuer: OWN_WALLET, revoked: false }),
    } as never);
    const adminSigner = { address: "0xadmin" };
    vi.mocked(getAdminSigner).mockReturnValue(adminSigner as never);
    vi.mocked(getSignerContract).mockReturnValue(revokingContract() as never);

    const result = await revokeCertificateOnChain(certificate, "Fraudulent award");

    expect(result.status).toBe("revoked");
    expect(getOperatorSigner).not.toHaveBeenCalled();
    expect(getSignerContract).toHaveBeenCalledWith(adminSigner);
  });

  it("falls back to admin when the operator key is corrupt rather than propagating the throw", async () => {
    const { issuer, course } = await createIssuerWithCourse();
    await prisma.issuer.update({ where: { id: issuer.id }, data: { operatorAddress: OPERATOR } });
    const certificate = await seedAnchoredCertificate(course.id);

    vi.mocked(getReadOnlyContract).mockReturnValue({
      getCredential: vi.fn().mockResolvedValue({ issuer: OPERATOR, revoked: false }),
    } as never);
    vi.mocked(getOperatorSigner).mockImplementation(() => {
      throw new Error("Malformed encrypted payload");
    });
    const adminSigner = { address: "0xadmin" };
    vi.mocked(getAdminSigner).mockReturnValue(adminSigner as never);
    vi.mocked(getSignerContract).mockReturnValue(revokingContract() as never);

    const result = await revokeCertificateOnChain(certificate, "Issued in error");

    expect(result.status).toBe("revoked");
    expect(getSignerContract).toHaveBeenCalledWith(adminSigner);
  });

  it("skips when no permitted signer is available at all", async () => {
    const { course } = await createIssuerWithCourse();
    const certificate = await seedAnchoredCertificate(course.id);

    vi.mocked(getReadOnlyContract).mockReturnValue({
      getCredential: vi.fn().mockResolvedValue({ issuer: OWN_WALLET, revoked: false }),
    } as never);
    vi.mocked(getAdminSigner).mockReturnValue(null);

    const result = await revokeCertificateOnChain(certificate, "Issued in error");

    expect(result).toEqual({ status: "skipped", reason: "no-signer" });
  });

  it("reports a failure instead of throwing when the transaction reverts", async () => {
    const { course } = await createIssuerWithCourse();
    const certificate = await seedAnchoredCertificate(course.id);

    vi.mocked(getReadOnlyContract).mockReturnValue({
      getCredential: vi.fn().mockResolvedValue({ issuer: OWN_WALLET, revoked: false }),
    } as never);
    vi.mocked(getAdminSigner).mockReturnValue({ address: "0xadmin" } as never);
    vi.mocked(getSignerContract).mockReturnValue({
      revokeCredential: vi.fn().mockRejectedValue(new Error("NotIssuerOrAdmin")),
    } as never);

    const result = await revokeCertificateOnChain(certificate, "Issued in error");

    expect(result).toEqual({ status: "failed", message: "NotIssuerOrAdmin" });
  });
});
