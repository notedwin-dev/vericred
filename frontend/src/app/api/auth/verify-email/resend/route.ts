import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { issueEmailVerification, VERIFICATION_RESEND_COOLDOWN_MS } from "@/lib/email-verification";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/verify-email/resend
 *
 * Unauthenticated by necessity: login is exactly what an unverified account
 * can't do (docs/institution-registration-prd.md Decision 5), so without this
 * a lost verification email locks the account out permanently.
 *
 * Always answers 200 for any well-formed address — whether the account
 * exists, is already verified, or is inside the resend cooldown — so the
 * endpoint can't be used to enumerate registered emails.
 */
export async function POST(request: NextRequest) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body?.email?.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const ok = NextResponse.json({
    message: "If that email has an unverified VeriCred account, a new verification link is on its way.",
  });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerified) {
    return ok;
  }

  const recentToken = await prisma.verificationToken.findFirst({
    where: { identifier: user.id, createdAt: { gt: new Date(Date.now() - VERIFICATION_RESEND_COOLDOWN_MS) } },
  });
  if (recentToken) {
    return ok;
  }

  try {
    await issueEmailVerification(user.id, email, request.nextUrl.origin);
  } catch (error) {
    console.error("Failed to resend verification email:", error);
  }

  return ok;
}
