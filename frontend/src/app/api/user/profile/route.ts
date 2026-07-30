import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAllowedAvatarUrl } from "@/lib/config";

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,30}$/;

/**
 * GET /api/user/profile
 *
 * Returns the current user's profile.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      pendingEmail: true,
      image: true,
      walletAddress: true,
      role: true,
      createdAt: true,
      accounts: { select: { provider: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { accounts, ...rest } = user;
  return NextResponse.json({ user: { ...rest, linkedProviders: accounts.map((a) => a.provider) } });
}

/**
 * PATCH /api/user/profile
 *
 * Updates the current user's profile (name, username, image).
 */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: string; username?: string; image?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: Prisma.UserUpdateInput = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string") {
      return NextResponse.json({ error: "name must be a string" }, { status: 400 });
    }
    const trimmed = body.name.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }
    data.name = trimmed;
  }

  if (body.username !== undefined) {
    if (body.username === "") {
      data.username = null;
    } else {
      const lower = body.username.toLowerCase();
      if (!USERNAME_RE.test(lower)) {
        return NextResponse.json(
          { error: "Username must be 3-30 characters (letters, numbers, hyphens, underscores)" },
          { status: 400 }
        );
      }
      const existing = await prisma.user.findUnique({ where: { username: lower } });
      if (existing && existing.id !== session.user.id) {
        return NextResponse.json({ error: "Username is already taken" }, { status: 409 });
      }
      data.username = lower;
    }
  }

  if (body.image !== undefined) {
    if (body.image === null) {
      data.image = null;
    } else if (typeof body.image !== "string" || !isAllowedAvatarUrl(body.image)) {
      return NextResponse.json({ error: "image must be a URL from the configured IPFS gateway" }, { status: 400 });
    } else {
      data.image = body.image;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data,
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        image: true,
        walletAddress: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Username is already taken" }, { status: 409 });
    }
    console.error("Failed to update profile:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
