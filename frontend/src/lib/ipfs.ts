/**
 * Uploads a file buffer to IPFS via Pinata's pinning API.
 *
 * If PINATA_API_KEY / PINATA_SECRET_KEY are not configured (e.g. local
 * development without a Pinata account), a deterministic mock CID is
 * returned instead so the rest of the issuance flow can be exercised
 * without a real pin. Never use the mock CID path in production.
 */

import { createHash } from "node:crypto";
import { IPFS_GATEWAY } from "@/lib/config";

const PINATA_PIN_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";

export interface UploadResult {
  cid: string;
  mock: boolean;
}

export async function uploadToIPFS(buffer: Buffer, filename: string): Promise<UploadResult> {
  const apiKey = process.env.PINATA_API_KEY;
  const secretKey = process.env.PINATA_SECRET_KEY;

  if (!apiKey || !secretKey) {
    console.warn(
      "[ipfs] PINATA_API_KEY / PINATA_SECRET_KEY not set — returning a mock CID. Do not use in production."
    );
    return { cid: mockCid(buffer, filename), mock: true };
  }

  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(buffer)]), filename);
  formData.append(
    "pinataMetadata",
    JSON.stringify({ name: filename })
  );
  formData.append(
    "pinataOptions",
    JSON.stringify({ cidVersion: 1 })
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    const response = await fetch(PINATA_PIN_FILE_URL, {
      method: "POST",
      headers: {
        pinata_api_key: apiKey,
        pinata_secret_api_key: secretKey,
      },
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Pinata upload failed (${response.status}): ${text || response.statusText}`);
    }

    const data = (await response.json()) as { IpfsHash?: string };
    if (!data.IpfsHash) {
      throw new Error("Pinata response did not include an IpfsHash");
    }

    return { cid: data.IpfsHash, mock: false };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Deterministic, obviously-fake CID for local development. Prefixed with
 * "mockCID" so it's unmistakable in logs and UI if it ever leaks through.
 *
 * Derived from the file's *contents*, not its name and length. A real CID is
 * content-addressed, and the previous `${filename}:${buffer.length}` hash was
 * not: two certificates whose PDFs happened to be the same size collided, and
 * re-issuing identical content produced a different CID than an unchanged
 * re-pin would. Integrity checks assume "same bytes ⇒ same CID", so dev has to
 * honour that too or it tests something production never does.
 */
function mockCid(buffer: Buffer, filename: string): string {
  void filename;
  const digest = createHash("sha256").update(buffer).digest();
  return `mockCID${BigInt("0x" + digest.subarray(0, 16).toString("hex")).toString(36)}`;
}

/**
 * Fetches an artifact back out of IPFS through the configured gateway.
 *
 * Exists as a named export so the download and integrity paths can be tested
 * by mocking one module rather than stubbing global fetch. Both a timeout and
 * a size cap are mandatory here: the gateway is an untrusted third party, and
 * without a cap a hostile or broken one can stream unbounded bytes into
 * memory on an unauthenticated endpoint.
 */
export async function fetchFromGateway(cid: string, maxBytes = 20 * 1024 * 1024): Promise<Buffer> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${IPFS_GATEWAY}/ipfs/${encodeURIComponent(cid)}`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Gateway returned ${response.status} for ${cid}`);
    }

    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new Error(`Artifact ${cid} declares ${declared} bytes, over the ${maxBytes} cap`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    // Re-check: content-length is advisory and may be absent or a lie.
    if (bytes.length > maxBytes) {
      throw new Error(`Artifact ${cid} is ${bytes.length} bytes, over the ${maxBytes} cap`);
    }
    return bytes;
  } finally {
    clearTimeout(timeoutId);
  }
}
