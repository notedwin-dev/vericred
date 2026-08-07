import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcrypt";
import { isAddress, verifyMessage } from "ethers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isValidUsername } from "@/lib/validation";
import { findWalletConflict } from "@/lib/wallet";
import { issueEmailVerification } from "@/lib/email-verification";

interface RegisterBody {
  name?: string;
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  walletAddress?: string;
  message?: string;
  signature?: string;
}

/**
 * POST /api/auth/register/user
 *
 * Individual signup. Per docs/prds/institution-registration-prd.md Decision 9,
 * username and a signature-verified wallet are mandatory here (not deferred
 * to a settings page) — this replaces /api/auth/register.
 */
export async function POST(request: NextRequest) {
  let body: RegisterBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, username, email, password, confirmPassword, walletAddress, message, signature } = body ?? {};

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!email || typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
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
    return NextResponse.json({ error: "A valid wallet address is required" }, { status: 400 });
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
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        username: normalizedUsername,
        email: normalizedEmail,
        passwordHash,
        walletAddress: normalizedWallet,
        role: "USER",
      },
      select: { id: true, name: true, username: true, email: true, walletAddress: true },
    });

    // The account exists now, so a failed send must not roll it back — the
    // user simply can't log in until they verify, and can ask for a resend.
    let emailSent = true;
    try {
      await issueEmailVerification(user.id, normalizedEmail, request.nextUrl.origin);
    } catch (error) {
      console.error("Failed to send registration verification email:", error);
      emailSent = false;
    }

    return NextResponse.json({ user, emailSent }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "An account with these details already exists" }, { status: 409 });
    }
    console.error("Failed to register user:", error);
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
  }
}
