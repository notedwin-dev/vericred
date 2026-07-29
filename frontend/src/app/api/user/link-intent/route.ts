import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createLinkIntent, LINK_INTENT_COOKIE, type LinkableProvider } from "@/lib/link-intent";

const LINKABLE_PROVIDERS = new Set<LinkableProvider>(["github", "google", "linkedin"]);

/**
 * POST /api/user/link-intent
 *
 * Stages a signed, short-lived cookie recording "the current user wants to
 * link `provider` to their account." The client follows this with
 * next-auth's `signIn(provider)`; the `signIn` callback in lib/auth.ts
 * reads the cookie to re-parent the resulting OAuth account onto this
 * user instead of creating a second one.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { provider?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.provider || !LINKABLE_PROVIDERS.has(body.provider as LinkableProvider)) {
    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 });
  }

  const intent = createLinkIntent(session.user.id, body.provider as LinkableProvider);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(LINK_INTENT_COOKIE, intent, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
