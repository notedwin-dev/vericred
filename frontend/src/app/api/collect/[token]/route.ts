import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ClaimCollectionLinkInput } from "@/types";

type RouteParams = { params: Promise<{ token: string }> };

/**
 * GET /api/collect/[token]
 *
 * Public endpoint — returns the collection link's course/status so an
 * unauthenticated visitor can see what they're about to claim before
 * signing in.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { token } = await params;

  const link = await prisma.collectionLink.findUnique({
    where: { token },
    include: { course: { include: { issuer: true } } },
  });

  if (!link) {
    return NextResponse.json({ error: "Collection link not found" }, { status: 404 });
  }

  const expired = !!link.linkExpiresAt && link.linkExpiresAt.getTime() < Date.now();
  const exhausted = !!link.maxCollections && link.currentCount >= link.maxCollections;

  return NextResponse.json({
    link: {
      token: link.token,
      active: link.active && !expired && !exhausted,
      maxCollections: link.maxCollections,
      currentCount: link.currentCount,
      linkExpiresAt: link.linkExpiresAt,
      certExpiresAt: link.certExpiresAt,
      course: {
        id: link.course.id,
        name: link.course.name,
        description: link.course.description,
        issuer: {
          organizationName: link.course.issuer.organizationName,
          logo: link.course.issuer.logo,
        },
      },
    },
  });
}

/**
 * POST /api/collect/[token]
 *
 * Claims a certificate via a self-service collection link. Requires an
 * authenticated session (so the certificate can be tied to a user record).
 * Validates that the link is active, not expired, and under its max
 * collection count, then atomically increments the count and creates a
 * PENDING certificate.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = await params;

  let body: ClaimCollectionLinkInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const recipientName = body?.recipientName?.trim() || session.user.name || undefined;
  if (!recipientName) {
    return NextResponse.json({ error: "recipientName is required" }, { status: 400 });
  }

  const recipientEmail = body?.recipientEmail || session.user.email || null;
  const walletAddress = body?.walletAddress || session.user.walletAddress || null;

  try {
    const certificate = await prisma.$transaction(async (tx) => {
      const link = await tx.collectionLink.findUnique({ where: { token } });
      if (!link) {
        throw new RouteError(404, "Collection link not found");
      }
      if (!link.active) {
        throw new RouteError(410, "This collection link is no longer active");
      }
      if (link.linkExpiresAt && link.linkExpiresAt.getTime() < Date.now()) {
        throw new RouteError(410, "This collection link has expired");
      }
      if (link.maxCollections !== null && link.currentCount >= link.maxCollections) {
        throw new RouteError(410, "This collection link has reached its maximum collections");
      }

      const existing = await tx.certificate.findFirst({
        where: { courseId: link.courseId, recipientId: session.user.id },
      });
      if (existing) {
        throw new RouteError(409, "You have already claimed a certificate for this course");
      }

      const credentialId = generateCredentialId();

      const certificate = await tx.certificate.create({
        data: {
          credentialId,
          recipientName,
          recipientEmail,
          recipientId: session.user.id,
          courseId: link.courseId,
          cid: "",
          walletAddress,
          expiresAt: link.certExpiresAt,
          status: "PENDING",
        },
      });

      const newCount = link.currentCount + 1;
      await tx.collectionLink.update({
        where: { token },
        data: {
          currentCount: newCount,
          active:
            link.maxCollections !== null && newCount >= link.maxCollections ? false : link.active,
        },
      });

      return certificate;
    });

    return NextResponse.json({ certificate }, { status: 201 });
  } catch (error) {
    if (error instanceof RouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to claim collection link:", error);
    return NextResponse.json({ error: "Failed to claim certificate" }, { status: 500 });
  }
}

class RouteError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function generateCredentialId(): string {
  const year = new Date().getFullYear();
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `VC-${year}-${random}`;
}
