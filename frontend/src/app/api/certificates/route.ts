import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "ethers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { generateCredentialId } from "@/lib/credential";
import { generateCertificate, type GeneratedCertificate } from "@/lib/generate-certificate";
import type { IssueCertificateInput } from "@/types";

/**
 * GET /api/certificates?recipientId=&courseId=
 *
 * Lists certificates visible to the current session:
 *  - USER   sees only their own certificates (recipientId is forced to self).
 *  - ISSUER sees certificates for courses they own (courseId, if given, must
 *           belong to them).
 *  - ADMIN  can filter freely by recipientId and/or courseId.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const recipientId = searchParams.get("recipientId") ?? undefined;
  const courseId = searchParams.get("courseId") ?? undefined;

  const where: Record<string, unknown> = {};

  if (session.user.role === "ADMIN") {
    if (recipientId) where.recipientId = recipientId;
    if (courseId) where.courseId = courseId;
  } else if (session.user.role === "ISSUER") {
    const issuer = await prisma.issuer.findUnique({
      where: { userId: session.user.id },
    });
    if (!issuer) {
      return NextResponse.json({ error: "Issuer profile not found" }, { status: 403 });
    }

    if (courseId) {
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course || course.issuerId !== issuer.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      where.courseId = courseId;
    } else {
      where.course = { issuerId: issuer.id };
    }

    if (recipientId) where.recipientId = recipientId;
  } else {
    // USER: always scoped to self, regardless of any recipientId query param.
    where.recipientId = session.user.id;
    if (courseId) where.courseId = courseId;
  }

  const certificates = await prisma.certificate.findMany({
    where,
    include: {
      course: {
        select: {
          name: true,
          issuer: {
            select: {
              organizationName: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ certificates });
}

/**
 * POST /api/certificates
 *
 * Creates a certificate: generates its PDF (from the course's template),
 * pins it to IPFS, and stores the resulting CID — the issuer never
 * supplies one. Requires an ISSUER (or ADMIN) session, and the target
 * course must belong to the calling issuer. `walletAddress` is optional;
 * without one the certificate stays PENDING until a wallet is known (see
 * lib/anchor.ts), since the contract requires a non-zero recipient.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ISSUER" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: IssueCertificateInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { recipientName, recipientEmail, recipientId, courseId, walletAddress, expiresAt, grade } =
    body ?? {};

  // Goes on the encrypted artifact only — never on the public preview or in
  // the public verify response. See docs/prds/encrypted-certificates.md.
  const trimmedGrade = typeof grade === "string" && grade.trim() ? grade.trim().slice(0, 64) : undefined;

  if (!recipientName || typeof recipientName !== "string" || !recipientName.trim()) {
    return NextResponse.json({ error: "recipientName is required" }, { status: 400 });
  }
  if (!courseId || typeof courseId !== "string") {
    return NextResponse.json({ error: "courseId is required" }, { status: 400 });
  }
  if (walletAddress && !isAddress(walletAddress)) {
    return NextResponse.json({ error: "walletAddress is not a valid Ethereum address" }, { status: 400 });
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

  let credentialId: string;
  if (body.credentialId) {
    if (typeof body.credentialId !== "string") {
      return NextResponse.json({ error: "credentialId must be a string" }, { status: 400 });
    }
    credentialId = body.credentialId.trim();
    if (!credentialId || !/^VC-\d{4}-[A-Z0-9]{4,12}$/.test(credentialId)) {
      return NextResponse.json({ error: "credentialId must match format VC-YYYY-SUFFIX" }, { status: 400 });
    }
  } else {
    credentialId = generateCredentialId();
  }

  const existing = await prisma.certificate.findUnique({ where: { credentialId } });
  if (existing) {
    return NextResponse.json(
      { error: `A certificate with credentialId "${credentialId}" already exists` },
      { status: 409 }
    );
  }

  const issuedAt = new Date();
  let artifact: GeneratedCertificate;
  try {
    artifact = await generateCertificate({
      credentialId,
      recipientName: recipientName.trim(),
      courseName: course.name,
      issuerName: course.issuer.organizationName,
      templateLayout: (course.template.layout as Record<string, string>) ?? {},
      issuedAt,
      grade: trimmedGrade,
      verifyUrl: new URL(`/verify/${encodeURIComponent(credentialId)}`, request.nextUrl.origin).toString(),
    });
  } catch (error) {
    console.error("Failed to generate certificate PDF:", error);
    return NextResponse.json({ error: "Failed to generate certificate PDF" }, { status: 502 });
  }

  // A mock CID resolves to nothing on any gateway, so the artifact would be
  // permanently unretrievable and the certificate unverifiable. The avatar
  // route already refuses one in production; certificates never did.
  if (artifact.mock && process.env.NODE_ENV === "production") {
    console.error("Refusing to issue a certificate with a mock IPFS CID — Pinata is not configured.");
    return NextResponse.json({ error: "Certificate issuance is unavailable right now." }, { status: 503 });
  }

  try {
    const certificate = await prisma.certificate.create({
      data: {
        credentialId,
        recipientName: recipientName.trim(),
        recipientEmail: recipientEmail || null,
        recipientId: recipientId || null,
        courseId,
        cid: artifact.cid,
        contentHash: artifact.contentHash,
        computedCid: artifact.computedCid,
        encKeyEnc: artifact.encKeyEnc,
        grade: trimmedGrade,
        walletAddress: walletAddress || null,
        issuedAt,
        expiresAt: expiresAtDate,
        status: "PENDING",
      },
    });

    return NextResponse.json({ certificate }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: `A certificate with credentialId "${credentialId}" already exists` },
        { status: 409 }
      );
    }
    console.error("Failed to create certificate:", error);
    return NextResponse.json({ error: "Failed to create certificate" }, { status: 500 });
  }
}
