import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { isAddress, verifyMessage } from "ethers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isFreemailDomain, isValidUsername } from "@/lib/validation";
import { findWalletConflict } from "@/lib/wallet";
import { issueEmailVerification } from "@/lib/email-verification";

interface RegisterInstitutionBody {
  organizationName?: string;
  logo?: string;
  email?: string;
  username?: string;
  password?: string;
  confirmPassword?: string;
  walletAddress?: string;
  message?: string;
  signature?: string;
}

/**
 * POST /api/auth/register/institution
 *
 * Self-service institution signup (docs/institution-registration-prd.md
 * §6.3). Creates User(role: USER) + Issuer(status: PENDING) -- NOT an
 * active ISSUER yet (Decision 1). An admin must approve before the
 * institution wallet is authorised on-chain and role flips to ISSUER.
 */
export async function POST(request: NextRequest) {
  let body: RegisterInstitutionBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { organizationName, logo, email, username, password, confirmPassword, walletAddress, message, signature } =
    body ?? {};

  if (!organizationName || typeof organizationName !== "string" || !organizationName.trim()) {
    return NextResponse.json({ error: "Organization name is required" }, { status: 400 });
  }
  if (!email || typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "A valid contact email is required" }, { status: 400 });
  }
  if (isFreemailDomain(email)) {
    return NextResponse.json(
      { error: "Please register with your institution's own email domain, not a personal/freemail address" },
      { status: 400 }
    );
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
  }
  if (!username || typeof username !== "string" || !isValidUsername(username.toLowerCase())) {
    return NextResponse.json(
      { error: "Username must be 3-32 characters (lowercase letters, numbers, hyphens, underscores)" },
      { status: 400 }
    );
  }
  if (!walletAddress || !isAddress(walletAddress)) {
    return NextResponse.json({ error: "A valid institution wallet address is required" }, { status: 400 });
  }
  if (!message || !signature) {
    return NextResponse.json({ error: "A wallet signature is required" }, { status: 400 });
  }

  try {
    const recovered = verifyMessage(message, signature);
    if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json({ error: "Signature does not match the provided address" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Could not verify signature" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase();
  const normalizedUsername = username.toLowerCase();
  const normalizedWallet = walletAddress.toLowerCase();

  const [existingEmail, existingUsername, walletConflict] = await Promise.all([
    prisma.user.findUnique({ where: { email: normalizedEmail } }),
    prisma.user.findUnique({ where: { username: normalizedUsername } }),
    findWalletConflict(normalizedWallet),
  ]);

  if (existingEmail) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }
  if (existingUsername) {
    return NextResponse.json({ error: "Username is already taken" }, { status: 409 });
  }
  if (walletConflict) {
    return NextResponse.json({ error: "This wallet is already linked to another account" }, { status: 409 });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const { issuer, userId } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: organizationName.trim(),
          username: normalizedUsername,
          email: normalizedEmail,
          passwordHash,
          role: "USER",
        },
      });
      const created = await tx.issuer.create({
        data: {
          userId: user.id,
          organizationName: organizationName.trim(),
          logo: logo ?? null,
          walletAddress: normalizedWallet,
          status: "PENDING",
        },
      });
      return { issuer: created, userId: user.id };
    });

    // Same as the individual path: the request already exists, so a failed
    // send must not roll it back — the contact can ask for a resend.
    let emailSent = true;
    try {
      await issueEmailVerification(userId, normalizedEmail, request.nextUrl.origin);
    } catch (error) {
      console.error("Failed to send registration verification email:", error);
      emailSent = false;
    }

    return NextResponse.json(
      { issuer: { id: issuer.id, status: issuer.status, organizationName: issuer.organizationName }, emailSent },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "An account with these details already exists" }, { status: 409 });
    }
    console.error("Failed to register institution:", error);
    return NextResponse.json({ error: "Failed to create institution request" }, { status: 500 });
  }
}
