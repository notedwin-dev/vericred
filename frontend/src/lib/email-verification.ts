import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";

export const VERIFICATION_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute

/**
 * Mints a single-use verification token for `userId` and emails the link to
 * `email`. Any outstanding token for the same user is discarded first, so a
 * resend always invalidates the previous link.
 *
 * Used by both registration paths (docs/institution-registration-prd.md
 * Decision 5 — email verification blocks login) and by the resend endpoint.
 * Throws if the email fails to send; callers decide whether that's fatal
 * (it isn't during registration — the account already exists and the user
 * can request a resend).
 */
export async function issueEmailVerification(userId: string, email: string, origin: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const verifyUrl = new URL(`/api/user/email/verify?token=${token}`, origin);

  await sendVerificationEmail(email, verifyUrl.toString());

  await prisma.verificationToken.deleteMany({ where: { identifier: userId } });
  await prisma.verificationToken.create({
    data: { identifier: userId, token, expires: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS) },
  });
}
