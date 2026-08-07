import bcrypt from "bcrypt";
import { verifyMessage } from "ethers";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/types";

/**
 * A refusal the user needs to be told the reason for, as opposed to the
 * deliberately-silent `null` return used for bad credentials.
 *
 * Deliberately NOT a subclass of Auth.js's `CredentialsSignin` — this module
 * stays framework-free so it can be exercised directly. `lib/auth.ts` adapts
 * these into the `CredentialsSignin` shape Auth.js needs to put `code` in the
 * sign-in redirect URL. Keep codes coarse: they end up in a URL.
 */
export class AuthorizationError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AuthorizationError";
    this.code = code;
  }
}

export class EmailNotVerifiedError extends AuthorizationError {
  constructor() {
    super("EmailNotVerified");
  }
}

/** The account authenticated, but it isn't an institution — wrong sign-in form. */
export class NotAnInstitutionError extends AuthorizationError {
  constructor() {
    super("NotAnInstitution");
  }
}

/** The account is an institution — it may not use the plain email/password form. */
export class InstitutionMustUseWalletError extends AuthorizationError {
  constructor() {
    super("InstitutionMustUseWallet");
  }
}

export class InstitutionWalletRequiredError extends AuthorizationError {
  constructor() {
    super("InstitutionWalletRequired");
  }
}

export class InstitutionWalletMismatchError extends AuthorizationError {
  constructor() {
    super("InstitutionWalletMismatch");
  }
}

export class InstitutionPendingError extends AuthorizationError {
  constructor() {
    super("InstitutionPending");
  }
}

export class InstitutionRejectedError extends AuthorizationError {
  constructor() {
    super("InstitutionRejected");
  }
}

export interface AuthorizedUser {
  id: string;
  name: string | null;
  username: string | null;
  email: string | null;
  image: string | null;
  role: Role;
  walletAddress: string | null;
}

function toAuthorizedUser(user: {
  id: string;
  name: string | null;
  username: string | null;
  email: string | null;
  image: string | null;
  role: Role;
  walletAddress: string | null;
}): AuthorizedUser {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    image: user.image,
    role: user.role,
    walletAddress: user.walletAddress,
  };
}

/**
 * Email + password sign-in.
 *
 * Returns null for anything that shouldn't hint at *why* it failed (unknown
 * account, wrong password), but throws EmailNotVerifiedError for an account
 * that exists and authenticated correctly yet has never proven ownership of
 * its email address (docs/institution-registration-prd.md Decision 5) — the
 * user needs to be told to go check their inbox, and by that point the
 * password has already been proven, so it leaks nothing.
 */
export async function authorizeEmailPassword(
  email: unknown,
  password: unknown
): Promise<AuthorizedUser | null> {
  const user = await authenticatePassword(email, password);
  if (!user) {
    return null;
  }

  // An institution must prove control of its on-chain wallet on every sign-in
  // (Decision 4). Without this, /login would be a way around that requirement.
  const issuer = await prisma.issuer.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (issuer) {
    throw new InstitutionMustUseWalletError();
  }

  return toAuthorizedUser(user);
}

interface InstitutionCredentials {
  email?: unknown;
  password?: unknown;
  message?: unknown;
  signature?: unknown;
}

/**
 * Institution sign-in: password AND a signature from the exact wallet
 * registered as `Issuer.walletAddress` (docs/institution-registration-prd.md
 * Decision 4). Not either/or — an institution that loses control of its wallet
 * loses the ability to sign in, which is the intended property, since that
 * wallet is its on-chain issuing identity.
 *
 * Unlike personal wallet-linking (proof once, at link time), this re-proves
 * ownership on every login.
 */
export async function authorizeInstitution(
  credentials: InstitutionCredentials
): Promise<AuthorizedUser | null> {
  const user = await authenticatePassword(credentials.email, credentials.password);
  if (!user) {
    return null;
  }

  const issuer = await prisma.issuer.findUnique({ where: { userId: user.id } });
  if (!issuer) {
    throw new NotAnInstitutionError();
  }

  const { message, signature } = credentials;
  if (typeof message !== "string" || typeof signature !== "string" || !message || !signature) {
    throw new InstitutionWalletRequiredError();
  }

  let recovered: string;
  try {
    recovered = verifyMessage(message, signature);
  } catch {
    throw new InstitutionWalletMismatchError();
  }
  if (recovered.toLowerCase() !== issuer.walletAddress.toLowerCase()) {
    throw new InstitutionWalletMismatchError();
  }

  // Identity proven — only now say whether the account is allowed in yet.
  if (issuer.status === "PENDING") {
    throw new InstitutionPendingError();
  }
  if (issuer.status === "REJECTED") {
    throw new InstitutionRejectedError();
  }

  return toAuthorizedUser(user);
}

/**
 * Shared first half of both sign-in paths: resolve the account, check the
 * password, and enforce email verification. Returns null (deliberately
 * uninformative) for an unknown account or a bad password.
 */
async function authenticatePassword(email: unknown, password: unknown) {
  if (typeof email !== "string" || typeof password !== "string") {
    return null;
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.passwordHash) {
    return null;
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return null;
  }

  if (!user.emailVerified) {
    throw new EmailNotVerifiedError();
  }

  return user;
}

/**
 * Refuses a personal wallet sign-in when the address is an institution's
 * on-chain identity.
 *
 * An `Issuer.walletAddress` is the organisation's identity on-chain, not a
 * login method. Without this check, a SIWE sign-in with an institution's
 * wallet silently created a fresh personal USER account holding that address,
 * leaving the same wallet on both `User.walletAddress` and
 * `Issuer.walletAddress` — exactly the ambiguity `findWalletConflict` exists
 * to prevent. Worse, the resulting account could never be reconciled: its own
 * wallet permanently collided with the institution's.
 *
 * Institutions sign in at /login/institution, which also requires the account
 * password (Decision 4).
 */
export async function assertWalletIsNotInstitution(normalizedAddress: string): Promise<void> {
  const issuer = await prisma.issuer.findUnique({
    where: { walletAddress: normalizedAddress },
    select: { id: true },
  });
  if (issuer) {
    throw new InstitutionMustUseWalletError();
  }
}
