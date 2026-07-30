import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "ethers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { generateCredentialId } from "@/lib/credential";
import { generateCertificate } from "@/lib/generate-certificate";
import { autoAnchorCertificate } from "@/lib/anchor";
import { RouteError } from "@/lib/route-error";
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
 * certificate — its PDF is generated and pinned to IPFS as part of the
 * claim, and if the claiming user already has a wallet address it's
 * anchored on-chain immediately (see lib/anchor.ts).
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

  let recipientName: string | undefined;
  if (typeof body?.recipientName === "string") {
    recipientName = body.recipientName.trim() || undefined;
  }
  if (!recipientName) {
    recipientName = session.user.name || undefined;
  }
  if (!recipientName) {
    return NextResponse.json({ error: "recipientName is required" }, { status: 400 });
  }

  const recipientEmail = body?.recipientEmail || session.user.email || null;

  let walletAddress: string | null = null;
  if (body?.walletAddress && isAddress(body.walletAddress)) {
    walletAddress = body.walletAddress;
  } else if (session.user.walletAddress && isAddress(session.user.walletAddress)) {
    walletAddress = session.user.walletAddress;
  }

  // Peek at the link so the certificate can be generated ahead of the
  // transaction (PDF rendering + IPFS pinning is too slow to hold a DB
  // transaction open for). Re-validated for real inside the transaction
  // below, so a link that becomes invalid in between just wastes an
  // unused IPFS pin rather than corrupting anything.
  const linkPeek = await prisma.collectionLink.findUnique({
    where: { token },
    include: { course: { include: { template: true, issuer: true } } },
  });
  if (!linkPeek) {
    return NextResponse.json({ error: "Collection link not found" }, { status: 404 });
  }

  const credentialId = generateCredentialId();
  let cid: string;
  try {
    const generated = await generateCertificate({
      credentialId,
      recipientName,
      courseName: linkPeek.course.name,
      issuerName: linkPeek.course.issuer.organizationName,
      templateLayout: (linkPeek.course.template.layout as Record<string, string>) ?? {},
      issuedAt: new Date(),
      verifyUrl: new URL(`/verify/${encodeURIComponent(credentialId)}`, request.nextUrl.origin).toString(),
    });
    cid = generated.cid;
  } catch (error) {
    console.error("Failed to generate certificate PDF:", error);
    return NextResponse.json({ error: "Failed to generate certificate PDF" }, { status: 502 });
  }

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

      const certificate = await tx.certificate.create({
        data: {
          credentialId,
          recipientName,
          recipientEmail,
          recipientId: session.user.id,
          courseId: link.courseId,
          cid,
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

    if (walletAddress) {
      const txHash = await autoAnchorCertificate(certificate);
      if (txHash) {
        certificate.status = "ACTIVE";
        certificate.txHash = txHash;
      }
    }

    return NextResponse.json({ certificate }, { status: 201 });
  } catch (error) {
    if (error instanceof RouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "You have already claimed a certificate for this course" }, { status: 409 });
    }
    console.error("Failed to claim collection link:", error);
    return NextResponse.json({ error: "Failed to claim certificate" }, { status: 500 });
  }
}
