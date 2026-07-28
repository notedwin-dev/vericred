import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ certificates });
}

/**
 * POST /api/certificates
 *
 * Creates a PENDING certificate record ahead of (or immediately after) the
 * on-chain `issueCredential` transaction. Requires an ISSUER (or ADMIN)
 * session, and the target course must belong to the calling issuer.
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

  const { recipientName, recipientEmail, recipientId, courseId, cid, txHash, walletAddress, expiresAt } =
    body ?? {};

  if (!recipientName || typeof recipientName !== "string") {
    return NextResponse.json({ error: "recipientName is required" }, { status: 400 });
  }
  if (!courseId || typeof courseId !== "string") {
    return NextResponse.json({ error: "courseId is required" }, { status: 400 });
  }
  if (!cid || typeof cid !== "string") {
    return NextResponse.json({ error: "cid is required" }, { status: 400 });
  }

  const course = await prisma.course.findUnique({ where: { id: courseId } });
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

  const credentialId = body.credentialId?.trim() || generateCredentialId();

  const existing = await prisma.certificate.findUnique({ where: { credentialId } });
  if (existing) {
    return NextResponse.json(
      { error: `A certificate with credentialId "${credentialId}" already exists` },
      { status: 409 }
    );
  }

  try {
    const certificate = await prisma.certificate.create({
      data: {
        credentialId,
        recipientName,
        recipientEmail: recipientEmail || null,
        recipientId: recipientId || null,
        courseId,
        cid,
        txHash: txHash || null,
        walletAddress: walletAddress || null,
        expiresAt: expiresAtDate,
        status: "PENDING",
      },
    });

    return NextResponse.json({ certificate }, { status: 201 });
  } catch (error) {
    console.error("Failed to create certificate:", error);
    return NextResponse.json({ error: "Failed to create certificate" }, { status: 500 });
  }
}

function generateCredentialId(): string {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `VC-${year}-${random}`;
}
