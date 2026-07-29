import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/user/email/verify?token=...
 *
 * Consumes a verification token minted by POST /api/user/email and, if
 * valid, promotes the user's pendingEmail to their real, unique email.
 * Token-only (no session required) since the link is opened from an email
 * client that may not carry the app's session cookie.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const settingsUrl = new URL("/dashboard/settings", request.nextUrl.origin);

  if (!token) {
    settingsUrl.searchParams.set("emailError", "invalid");
    return NextResponse.redirect(settingsUrl);
  }

  const record = await prisma.verificationToken.findUnique({ where: { token } });
  if (!record || record.expires < new Date()) {
    if (record) await prisma.verificationToken.delete({ where: { token } }).catch(() => {});
    settingsUrl.searchParams.set("emailError", "expired");
    return NextResponse.redirect(settingsUrl);
  }

  const userId = record.identifier;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.pendingEmail) {
    await prisma.verificationToken.delete({ where: { token } }).catch(() => {});
    settingsUrl.searchParams.set("emailError", "invalid");
    return NextResponse.redirect(settingsUrl);
  }

  const taken = await prisma.user.findFirst({
    where: { email: user.pendingEmail, emailVerified: { not: null }, id: { not: userId } },
  });
  if (taken) {
    await prisma.verificationToken.delete({ where: { token } }).catch(() => {});
    settingsUrl.searchParams.set("emailError", "taken");
    return NextResponse.redirect(settingsUrl);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { email: user.pendingEmail, emailVerified: new Date(), pendingEmail: null },
  });
  await prisma.verificationToken.deleteMany({ where: { identifier: userId } });

  settingsUrl.searchParams.set("emailVerified", "1");
  return NextResponse.redirect(settingsUrl);
}
