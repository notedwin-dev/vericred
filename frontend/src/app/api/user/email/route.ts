import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * POST /api/user/email
 *
 * For wallet-first accounts that signed up without an email: stages an
 * email address (and optionally a password, enabling credentials login)
 * pending verification. The address only becomes the account's real,
 * unique `email` once the user clicks the link sent to it — this stops a
 * wallet user from squatting on someone else's address in the meantime.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  if (body.password !== undefined && body.password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const existingVerified = await prisma.user.findFirst({
    where: { email, emailVerified: { not: null } },
  });
  if (existingVerified && existingVerified.id !== session.user.id) {
    return NextResponse.json({ error: "Email is already in use" }, { status: 409 });
  }

  const passwordHash = body.password ? await bcrypt.hash(body.password, 10) : undefined;

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      pendingEmail: email,
      ...(passwordHash ? { passwordHash } : {}),
    },
  });

  const identifier = session.user.id;
  await prisma.verificationToken.deleteMany({ where: { identifier } });

  const token = randomBytes(32).toString("hex");
  await prisma.verificationToken.create({
    data: { identifier, token, expires: new Date(Date.now() + TOKEN_TTL_MS) },
  });

  const verifyUrl = new URL(`/api/user/email/verify?token=${token}`, request.nextUrl.origin);
  await sendVerificationEmail(email, verifyUrl.toString());

  return NextResponse.json({ pendingEmail: email });
}
