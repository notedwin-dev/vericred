import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uploadToIPFS } from "@/lib/ipfs";
import { IPFS_GATEWAY } from "@/lib/config";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/**
 * POST /api/user/avatar
 *
 * Uploads a profile image to IPFS and returns the gateway URL. Does not
 * itself update the user record — the client follows up with
 * PATCH /api/user/profile to persist the returned URL.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Unsupported image type. Use PNG, JPEG, WEBP, or GIF." },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Image must be under 5MB." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let cid: string;
  let mock: boolean;
  try {
    const result = await uploadToIPFS(buffer, `avatar-${session.user.id}-${Date.now()}`);
    cid = result.cid;
    mock = result.mock;
  } catch (error) {
    console.error("Failed to upload avatar to IPFS:", error);
    return NextResponse.json({ error: "Failed to upload image. Please try again." }, { status: 502 });
  }

  if (mock && process.env.NODE_ENV === "production") {
    console.error("Refusing to serve a mock IPFS CID for an avatar upload in production — Pinata is not configured.");
    return NextResponse.json({ error: "Image upload is not available right now." }, { status: 503 });
  }

  return NextResponse.json({ url: `${IPFS_GATEWAY}/ipfs/${cid}` });
}
