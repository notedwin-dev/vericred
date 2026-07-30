import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const LINK_INTENT_COOKIE = "vc_link_intent";
export const LINK_INTENT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const TTL_MS = LINK_INTENT_TTL_MS;

export type LinkableProvider = "github" | "google" | "linkedin";

interface LinkIntentPayload {
  userId: string;
  provider: LinkableProvider;
  nonce: string;
  exp: number;
}

function secret(): string {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("NEXTAUTH_SECRET is not set");
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

/**
 * Signs a short-lived intent recording "user X wants to link provider Y to
 * their already-authenticated account." Carried across the OAuth redirect
 * as a cookie since the `signIn` callback that completes the link has no
 * other way to know which existing user initiated it.
 */
export function createLinkIntent(userId: string, provider: LinkableProvider): string {
  const payload: LinkIntentPayload = {
    userId,
    provider,
    nonce: randomBytes(16).toString("hex"),
    exp: Date.now() + TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyLinkIntent(cookieValue: string | undefined): LinkIntentPayload | null {
  if (!cookieValue) return null;
  const [body, signature] = cookieValue.split(".");
  if (!body || !signature) return null;

  const expected = sign(body);
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as LinkIntentPayload;
    if (typeof payload.userId !== "string" || typeof payload.provider !== "string") return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
