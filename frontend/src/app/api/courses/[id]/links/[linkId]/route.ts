import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { UpdateCollectionLinkInput } from "@/types";

type RouteParams = { params: Promise<{ id: string; linkId: string }> };

async function getOwnedCourse(userId: string, role: string, courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return null;
  if (role === "ADMIN") return course;

  const issuer = await prisma.issuer.findUnique({ where: { userId } });
  if (!issuer || issuer.id !== course.issuerId) return null;
  return course;
}

/**
 * PATCH /api/courses/[id]/links/[linkId]
 *
 * Edits a collection link's limits/expiry, or manually toggles it
 * active/inactive. Any field can be set to `null` to clear it (e.g.
 * unlimited collections again); omitted fields are left unchanged.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ISSUER" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, linkId } = await params;
  const course = await getOwnedCourse(session.user.id, session.user.role, id);
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const link = await prisma.collectionLink.findUnique({ where: { id: linkId } });
  if (!link || link.courseId !== id) {
    return NextResponse.json({ error: "Collection link not found" }, { status: 404 });
  }

  let body: UpdateCollectionLinkInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: {
    maxCollections?: number | null;
    linkExpiresAt?: Date | null;
    certExpiresAt?: Date | null;
    active?: boolean;
  } = {};

  if (body.maxCollections !== undefined) {
    if (body.maxCollections === null) {
      data.maxCollections = null;
    } else {
      if (!Number.isInteger(body.maxCollections) || body.maxCollections <= 0) {
        return NextResponse.json({ error: "maxCollections must be a positive integer" }, { status: 400 });
      }
      if (body.maxCollections < link.currentCount) {
        return NextResponse.json(
          { error: `maxCollections can't be less than the ${link.currentCount} already claimed` },
          { status: 400 }
        );
      }
      data.maxCollections = body.maxCollections;
    }
  }

  if (body.linkExpiresAt !== undefined) {
    if (body.linkExpiresAt === null) {
      data.linkExpiresAt = null;
    } else {
      const date = new Date(body.linkExpiresAt);
      if (Number.isNaN(date.getTime())) {
        return NextResponse.json({ error: "linkExpiresAt is not a valid date" }, { status: 400 });
      }
      if (date.getTime() <= Date.now()) {
        return NextResponse.json({ error: "linkExpiresAt must be in the future" }, { status: 400 });
      }
      data.linkExpiresAt = date;
    }
  }

  if (body.certExpiresAt !== undefined) {
    if (body.certExpiresAt === null) {
      data.certExpiresAt = null;
    } else {
      const date = new Date(body.certExpiresAt);
      if (Number.isNaN(date.getTime())) {
        return NextResponse.json({ error: "certExpiresAt is not a valid date" }, { status: 400 });
      }
      if (date.getTime() <= Date.now()) {
        return NextResponse.json({ error: "certExpiresAt must be in the future" }, { status: 400 });
      }
      data.certExpiresAt = date;
    }
  }

  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") {
      return NextResponse.json({ error: "active must be a boolean" }, { status: 400 });
    }
    data.active = body.active;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await prisma.collectionLink.update({ where: { id: linkId }, data });
  return NextResponse.json({ link: updated });
}
