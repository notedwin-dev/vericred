import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { UpdateCourseInput } from "@/types";

type RouteParams = { params: Promise<{ id: string }> };

async function assertOwnership(userId: string, role: string, courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { _count: { select: { certificates: true } } },
  });
  if (!course) return { course: null, allowed: false };

  if (role === "ADMIN") return { course, allowed: true };

  const issuer = await prisma.issuer.findUnique({ where: { userId } });
  return { course, allowed: !!issuer && issuer.id === course.issuerId };
}

/**
 * GET /api/courses/[id]
 *
 * Returns a course along with its certificate count.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { course, allowed } = await assertOwnership(session.user.id, session.user.role, id);

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    course: { ...course, certificateCount: course._count.certificates },
  });
}

/**
 * PATCH /api/courses/[id]
 *
 * Updates a course's name, description, or template.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { course, allowed } = await assertOwnership(session.user.id, session.user.role, id);

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: UpdateCourseInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, description, templateId } = body ?? {};
  const data: Record<string, unknown> = {};

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
    }
    data.name = name;
  }
  if (description !== undefined) {
    data.description = description || null;
  }
  if (templateId !== undefined) {
    if (typeof templateId !== "string") {
      return NextResponse.json({ error: "templateId must be a string" }, { status: 400 });
    }
    const template = await prisma.certificateTemplate.findUnique({ where: { id: templateId } });
    if (!template || template.issuerId !== course.issuerId) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    data.templateId = templateId;
  }

  const updated = await prisma.course.update({ where: { id }, data });
  return NextResponse.json({ course: updated });
}

/**
 * DELETE /api/courses/[id]
 *
 * Deletes a course, but only if it has no certificates issued against it —
 * certificates are permanent records and must not be orphaned.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { course, allowed } = await assertOwnership(session.user.id, session.user.role, id);

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const freshCourse = await tx.course.findUnique({
        where: { id },
        include: { _count: { select: { certificates: true } } },
      });

      if (!freshCourse) {
        throw new Error("COURSE_NOT_FOUND");
      }

      if (freshCourse._count.certificates > 0) {
        throw new Error("COURSE_HAS_CERTIFICATES");
      }

      await tx.collectionLink.deleteMany({ where: { courseId: id } });
      await tx.course.delete({ where: { id } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "COURSE_HAS_CERTIFICATES") {
      return NextResponse.json(
        { error: "Cannot delete a course that has certificates issued against it" },
        { status: 409 }
      );
    }
    throw error;
  }
}
