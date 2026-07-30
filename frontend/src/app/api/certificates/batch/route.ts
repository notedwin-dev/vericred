import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "ethers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateCredentialId } from "@/lib/credential";
import { generateCertificate } from "@/lib/generate-certificate";
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
    let cid: string;
    try {
      const generated = await generateCertificate({
        credentialId,
        recipientName,
        courseName: course.name,
        issuerName: course.issuer.organizationName,
        templateLayout,
        issuedAt,
        verifyUrl: new URL(`/verify/${encodeURIComponent(credentialId)}`, request.nextUrl.origin).toString(),
      });
      cid = generated.cid;
    } catch (error) {
      console.error(`Failed to generate certificate PDF for row "${recipientName}":`, error);
      return NextResponse.json(
        { error: `Failed to generate PDF for "${recipientName}"`, created },
        { status: 502 }
      );
    }

    const certificate = await prisma.certificate.create({
      data: {
        credentialId,
        recipientName,
        recipientEmail: row.recipientEmail || null,
        courseId,
        cid,
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
