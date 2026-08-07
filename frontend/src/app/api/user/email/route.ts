import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { issueEmailVerification, VERIFICATION_RESEND_COOLDOWN_MS } from "@/lib/email-verification";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  // On this path `User.email` is only ever written once verified, but a
  // credentials registration (see /api/auth/register/user) sets it
  // immediately without setting emailVerified — so any existing row with
  // this email is a real collision, not just verified ones, or promoting
  // this pendingEmail later would fail the column's unique constraint.
  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing && existing.id !== session.user.id) {
    return NextResponse.json({ error: "Email is already in use" }, { status: 409 });
  }

  const identifier = session.user.id;

  const recentToken = await prisma.verificationToken.findFirst({
    where: { identifier, createdAt: { gt: new Date(Date.now() - VERIFICATION_RESEND_COOLDOWN_MS) } },
  });
  if (recentToken) {
    return NextResponse.json(
      { error: "Please wait a minute before requesting another verification email." },
      { status: 429 }
    );
  }

  // Send before staging pendingEmail, so a delivery failure leaves the
  // account exactly as it was rather than half-way through an email change.
  try {
    await issueEmailVerification(identifier, email, request.nextUrl.origin);
  } catch (error) {
    console.error("Failed to send verification email:", error);
    return NextResponse.json({ error: "Failed to send verification email. Please try again later." }, { status: 503 });
  }

  const passwordHash = body.password ? await bcrypt.hash(body.password, 10) : undefined;

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      pendingEmail: email,
      ...(passwordHash ? { passwordHash } : {}),
    },
  });

  return NextResponse.json({ pendingEmail: email });
}
