import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "ethers";
import { auth } from "@/lib/auth";
import { getAdminSigner, getReadOnlyContract, getSignerContract } from "@/lib/contract";
import { parseContractError } from "@/lib/errors";
import type { InstitutionDTO } from "@/types";

/**
 * GET /api/institutions
 *
 * Admin-only. Reconstructs the set of institutions ever authorised by
 * replaying `InstitutionAuthorised` / `InstitutionRemoved` events from the
 * contract, since the contract itself only exposes a per-address boolean
 * mapping (no on-chain enumeration).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const contract = getReadOnlyContract();

    const [authorisedEvents, removedEvents] = await Promise.all([
      contract.queryFilter(contract.filters.InstitutionAuthorised()),
      contract.queryFilter(contract.filters.InstitutionRemoved()),
    ]);

    const institutions = new Map<string, InstitutionDTO>();

    for (const event of authorisedEvents) {
      if (!("args" in event) || !event.args) continue;
      const institution = String(event.args.institution).toLowerCase();
      const by = String(event.args.by);
      const block = await event.getBlock();
      institutions.set(institution, {
        address: institution,
        authorised: true,
        authorisedAt: new Date(block.timestamp * 1000).toISOString(),
        authorisedBy: by,
      });
    }

    for (const event of removedEvents) {
      if (!("args" in event) || !event.args) continue;
      const institution = String(event.args.institution).toLowerCase();
      const existing = institutions.get(institution);
      if (existing) {
        existing.authorised = false;
      } else {
        institutions.set(institution, { address: institution, authorised: false });
      }
    }

    return NextResponse.json({ institutions: Array.from(institutions.values()) });
  } catch (error) {
    console.error("Failed to load institutions:", error);
    return NextResponse.json({ error: parseContractError(error) }, { status: 500 });
  }
}

/**
 * POST /api/institutions
 *
 * Admin-only. Authorises a wallet address to issue credentials by calling
 * the contract's `authoriseInstitution`. Requires `ADMIN_PRIVATE_KEY` to be
 * configured so the server can sign the transaction on the admin's behalf;
 * without it, admins should call the contract directly from their wallet.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { address?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const address = body?.address;
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "A valid address is required" }, { status: 400 });
  }

  const signer = getAdminSigner();
  if (!signer) {
    return NextResponse.json(
      {
        error:
          "Server-side signing is not configured (ADMIN_PRIVATE_KEY missing). Authorise this institution from the admin wallet directly.",
      },
      { status: 501 }
    );
  }

  try {
    const contract = getSignerContract(signer);
    const tx = await contract.authoriseInstitution(address);
    const receipt = await tx.wait();

    return NextResponse.json(
      { success: true, address, txHash: receipt?.hash ?? tx.hash },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to authorise institution:", error);
    return NextResponse.json({ error: parseContractError(error) }, { status: 500 });
  }
}

/**
 * DELETE /api/institutions?address=0x...
 *
 * Admin-only. Removes an institution's ability to issue new credentials by
 * calling the contract's `removeInstitution`. Requires `ADMIN_PRIVATE_KEY`.
 */
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "A valid address query param is required" }, { status: 400 });
  }

  const signer = getAdminSigner();
  if (!signer) {
    return NextResponse.json(
      {
        error:
          "Server-side signing is not configured (ADMIN_PRIVATE_KEY missing). Remove this institution from the admin wallet directly.",
      },
      { status: 501 }
    );
  }

  try {
    const contract = getSignerContract(signer);
    const tx = await contract.removeInstitution(address);
    const receipt = await tx.wait();

    return NextResponse.json({ success: true, address, txHash: receipt?.hash ?? tx.hash });
  } catch (error) {
    console.error("Failed to remove institution:", error);
    return NextResponse.json({ error: parseContractError(error) }, { status: 500 });
  }
}
