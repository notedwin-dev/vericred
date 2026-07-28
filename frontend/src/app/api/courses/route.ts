import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { CreateCourseInput } from "@/types";

/**
 * GET /api/courses
 *
 * Lists courses owned by the authenticated issuer. Admins may pass
 * `?issuerId=` to view any issuer's courses.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const issuerIdParam = searchParams.get("issuerId");

  let issuerId: string | undefined;

  if (session.user.role === "ADMIN") {
    if (issuerIdParam) {
      issuerId = issuerIdParam;
    }
    // Admin without issuerIdParam: issuerId remains undefined, will list all courses
  } else {
    if (session.user.role !== "ISSUER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const issuer = await prisma.issuer.findUnique({ where: { userId: session.user.id } });
    if (!issuer) {
      return NextResponse.json({ error: "Issuer profile not found" }, { status: 403 });
    }
    issuerId = issuer.id;
  }

  const where = issuerId ? { issuerId } : {};

  const courses = await prisma.course.findMany({
    where,
    include: { _count: { select: { certificates: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    courses: courses.map((c) => ({
      ...c,
      certificateCount: c._count.certificates,
    })),
  });
}

/**
 * POST /api/courses
 *
 * Creates a course owned by the authenticated issuer.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ISSUER" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const issuer = await prisma.issuer.findUnique({ where: { userId: session.user.id } });
  if (!issuer) {
    return NextResponse.json({ error: "Issuer profile not found" }, { status: 403 });
  }

  let body: CreateCourseInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, description, templateId } = body ?? {};

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!templateId || typeof templateId !== "string") {
    return NextResponse.json({ error: "templateId is required" }, { status: 400 });
  }

  const template = await prisma.certificateTemplate.findUnique({ where: { id: templateId } });
  if (!template || template.issuerId !== issuer.id) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const course = await prisma.course.create({
    data: {
      name,
      description: description || null,
      templateId,
      issuerId: issuer.id,
    },
  });

  return NextResponse.json({ course }, { status: 201 });
}
