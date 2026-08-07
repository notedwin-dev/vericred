import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "ethers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateCredentialId } from "@/lib/credential";
import { generateCertificate, type GeneratedCertificate } from "@/lib/generate-certificate";
import type { BatchIssueCertificateRow } from "@/types";

const MAX_ROWS = 100;

/**
 * POST /api/certificates/batch
 *
 * CSV-driven batch issuance. Creates one certificate per row — each gets
 * its own generated PDF pinned to IPFS, just like single issuance.
 * Rows without a walletAddress stay PENDING; the client is responsible
 * for anchoring the rows that *do* have one via a single
 * issueCredentialBatch() transaction (see issue-certificate-dialog.tsx),
 * since only the issuer's own connected wallet should sign that batch —
 * this route never touches the chain.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ISSUER" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { courseId?: string; rows?: BatchIssueCertificateRow[]; expiresAt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { courseId, rows, expiresAt } = body ?? {};

  if (!courseId || typeof courseId !== "string") {
    return NextResponse.json({ error: "courseId is required" }, { status: 400 });
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "At least one row is required" }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `A batch can have at most ${MAX_ROWS} rows` }, { status: 400 });
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { template: true, issuer: true },
  });
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  if (session.user.role === "ISSUER") {
    const issuer = await prisma.issuer.findUnique({ where: { userId: session.user.id } });
    if (!issuer || course.issuerId !== issuer.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let expiresAtDate: Date | undefined;
  if (expiresAt) {
    expiresAtDate = new Date(expiresAt);
    if (Number.isNaN(expiresAtDate.getTime())) {
      return NextResponse.json({ error: "expiresAt is not a valid date" }, { status: 400 });
    }
    if (expiresAtDate.getTime() <= Date.now()) {
      return NextResponse.json({ error: "expiresAt must be in the future" }, { status: 400 });
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.recipientName || typeof row.recipientName !== "string" || !row.recipientName.trim()) {
      return NextResponse.json({ error: `Row ${i + 1}: recipientName is required` }, { status: 400 });
    }
    if (row.walletAddress && !isAddress(row.walletAddress)) {
      return NextResponse.json({ error: `Row ${i + 1}: walletAddress is not a valid address` }, { status: 400 });
    }
  }

  const created = [];
  const templateLayout = (course.template.layout as Record<string, string>) ?? {};

  for (const row of rows) {
    const recipientName = row.recipientName.trim();
    let credentialId = generateCredentialId();
    // Astronomically unlikely, but cheap to guard against a collision.
    while (await prisma.certificate.findUnique({ where: { credentialId } })) {
      credentialId = generateCredentialId();
    }

    const issuedAt = new Date();
    const grade =
      typeof row.grade === "string" && row.grade.trim() ? row.grade.trim().slice(0, 64) : undefined;
    let artifact: GeneratedCertificate;
    try {
      artifact = await generateCertificate({
        credentialId,
        recipientName,
        courseName: course.name,
        issuerName: course.issuer.organizationName,
        templateLayout,
        issuedAt,
        grade,
        verifyUrl: new URL(`/verify/${encodeURIComponent(credentialId)}`, request.nextUrl.origin).toString(),
      });
    } catch (error) {
      console.error(`Failed to generate certificate PDF for row "${recipientName}":`, error);
      return NextResponse.json(
        { error: `Failed to generate PDF for "${recipientName}"`, created },
        { status: 502 }
      );
    }

    // Only knowable after the first upload, so the guard lives in the loop.
    // Returns what was created so far, matching the partial-failure shape above.
    if (artifact.mock && process.env.NODE_ENV === "production") {
      console.error("Refusing to issue certificates with a mock IPFS CID — Pinata is not configured.");
      return NextResponse.json(
        { error: "Certificate issuance is unavailable right now.", created },
        { status: 503 }
      );
    }

    const certificate = await prisma.certificate.create({
      data: {
        credentialId,
        recipientName,
        recipientEmail: row.recipientEmail || null,
        courseId,
        cid: artifact.cid,
        contentHash: artifact.contentHash,
        computedCid: artifact.computedCid,
        encKeyEnc: artifact.encKeyEnc,
        grade,
        walletAddress: row.walletAddress || null,
        issuedAt,
        expiresAt: expiresAtDate,
        status: "PENDING",
      },
    });
    created.push(certificate);
  }

  return NextResponse.json({ certificates: created }, { status: 201 });
}
