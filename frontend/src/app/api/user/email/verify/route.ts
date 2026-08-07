import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/user/email/verify?token=...
 *
 * Consumes a single-use verification token and marks the user's email as
 * verified. Serves two flows that share one token table:
 *
 *  - **Registration** (no pendingEmail): the address is already on the
 *    account but unproven, and login is blocked until it is
 *    (docs/institution-registration-prd.md Decision 5). Lands on /login.
 *  - **Email change** on a wallet-first account (pendingEmail staged):
 *    promotes pendingEmail to the real, unique email. Lands on Settings.
 *
 * Token-only (no session required) since the link is opened from an email
 * client that may not carry the app's session cookie.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const origin = request.nextUrl.origin;

  if (!token) {
    return NextResponse.redirect(errorUrl(new URL("/dashboard/settings", origin), "invalid"));
  }

  const record = await prisma.verificationToken.findUnique({ where: { token } });
  if (!record || record.expires < new Date()) {
    if (record) await prisma.verificationToken.delete({ where: { token } }).catch(() => {});
    return NextResponse.redirect(errorUrl(new URL("/dashboard/settings", origin), "expired"));
  }

  const userId = record.identifier;
  const user = await prisma.user.findUnique({ where: { id: userId } });

  // Where the user is sent afterwards depends on which flow minted the
  // token: a registration verifier isn't signed in yet, an email-changer is.
  const isRegistration = Boolean(user && !user.pendingEmail);
  const destination = new URL(isRegistration ? "/login" : "/dashboard/settings", origin);

  if (!user || (!user.pendingEmail && (!user.email || user.emailVerified))) {
    await prisma.verificationToken.delete({ where: { token } }).catch(() => {});
    return NextResponse.redirect(errorUrl(destination, "invalid"));
  }

  const emailToVerify = user.pendingEmail ?? user.email!;

  const taken = await prisma.user.findFirst({
    where: { email: emailToVerify, emailVerified: { not: null }, id: { not: userId } },
  });
  if (taken) {
    await prisma.verificationToken.delete({ where: { token } }).catch(() => {});
    return NextResponse.redirect(errorUrl(destination, "taken"));
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { email: emailToVerify, emailVerified: new Date(), pendingEmail: null },
    });
  } catch (error) {
    // Race with another row claiming the same email between the `taken`
    // check above and this update — the unique constraint on User.email
    // is the actual source of truth here.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await prisma.verificationToken.delete({ where: { token } }).catch(() => {});
      return NextResponse.redirect(errorUrl(destination, "taken"));
    }
    throw error;
  }
  await prisma.verificationToken.deleteMany({ where: { identifier: userId } });

  destination.searchParams.set("emailVerified", "1");
  return NextResponse.redirect(destination);
}

function errorUrl(url: URL, reason: string) {
  url.searchParams.set("emailError", reason);
  return url;
}
