import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { CreateTemplateInput } from "@/types";

/**
 * GET /api/templates
 *
 * Lists certificate templates owned by the authenticated issuer.
 */
export async function GET() {
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

  const templates = await prisma.certificateTemplate.findMany({
    where: { issuerId: issuer.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ templates });
}

/**
 * POST /api/templates
 *
 * Creates a certificate template (a named JSON layout) for the
 * authenticated issuer.
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

  let body: CreateTemplateInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, layout } = body ?? {};

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (layout === undefined || layout === null) {
    return NextResponse.json({ error: "layout is required" }, { status: 400 });
  }
  if (typeof layout !== "object" || Array.isArray(layout)) {
    return NextResponse.json({ error: "layout must be a plain object" }, { status: 400 });
  }

  const layoutJson = JSON.stringify(layout);
  const MAX_LAYOUT_SIZE = 100 * 1024; // 100KB
  if (layoutJson.length > MAX_LAYOUT_SIZE) {
    return NextResponse.json({ error: "layout exceeds maximum size of 100KB" }, { status: 400 });
  }

  const template = await prisma.certificateTemplate.create({
    data: {
      name,
      layout,
      issuerId: issuer.id,
    },
  });

  return NextResponse.json({ template }, { status: 201 });
}
