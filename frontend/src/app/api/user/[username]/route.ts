import { NextRequest, NextResponse } from "next/server";
import { getPublicProfile } from "@/lib/public-profile";

/**
 * GET /api/user/:username
 *
 * Returns a public profile by username, including their active credentials.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  const user = await getPublicProfile(username);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ user });
}
