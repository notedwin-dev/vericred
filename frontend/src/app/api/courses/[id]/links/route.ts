import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { CreateCollectionLinkInput } from "@/types";

type RouteParams = { params: Promise<{ id: string }> };

async function getOwnedCourse(userId: string, role: string, courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return null;
  if (role === "ADMIN") return course;

  const issuer = await prisma.issuer.findUnique({ where: { userId } });
  if (!issuer || issuer.id !== course.issuerId) return null;
  return course;
}

/**
 * GET /api/courses/[id]/links
 *
 * Lists self-service collection links for a course.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const course = await getOwnedCourse(session.user.id, session.user.role, id);
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const links = await prisma.collectionLink.findMany({
    where: { courseId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ links });
}

/**
 * POST /api/courses/[id]/links
 *
 * Creates a new collection link recipients can use to self-claim a
 * certificate for this course.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ISSUER" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const course = await getOwnedCourse(session.user.id, session.user.role, id);
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  let body: CreateCollectionLinkInput = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { maxCollections, linkExpiresAt, certExpiresAt } = body ?? {};

  if (maxCollections !== undefined && (!Number.isInteger(maxCollections) || maxCollections <= 0)) {
    return NextResponse.json({ error: "maxCollections must be a positive integer" }, { status: 400 });
  }

  let linkExpiresAtDate: Date | undefined;
  if (linkExpiresAt) {
    linkExpiresAtDate = new Date(linkExpiresAt);
    if (Number.isNaN(linkExpiresAtDate.getTime())) {
      return NextResponse.json({ error: "linkExpiresAt is not a valid date" }, { status: 400 });
    }
  }

  let certExpiresAtDate: Date | undefined;
  if (certExpiresAt) {
    certExpiresAtDate = new Date(certExpiresAt);
    if (Number.isNaN(certExpiresAtDate.getTime())) {
      return NextResponse.json({ error: "certExpiresAt is not a valid date" }, { status: 400 });
    }
  }

  const link = await prisma.collectionLink.create({
    data: {
      courseId: id,
      maxCollections: maxCollections ?? null,
      linkExpiresAt: linkExpiresAtDate ?? null,
      certExpiresAt: certExpiresAtDate ?? null,
    },
  });

  return NextResponse.json({ link }, { status: 201 });
}
