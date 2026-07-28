/**
 * Uploads a file buffer to IPFS via Pinata's pinning API.
 *
 * If PINATA_API_KEY / PINATA_SECRET_KEY are not configured (e.g. local
 * development without a Pinata account), a deterministic mock CID is
 * returned instead so the rest of the issuance flow can be exercised
 * without a real pin. Never use the mock CID path in production.
 */

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

  const response = await fetch(PINATA_PIN_FILE_URL, {
    method: "POST",
    headers: {
      pinata_api_key: apiKey,
      pinata_secret_api_key: secretKey,
    },
    body: formData,
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
}

/**
 * Deterministic, obviously-fake CID for local development. Prefixed with
 * "mockCID" so it's unmistakable in logs and UI if it ever leaks through.
 */
function mockCid(buffer: Buffer, filename: string): string {
  let hash = 0;
  const input = `${filename}:${buffer.length}`;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return `mockCID${hash.toString(36)}`;
}
