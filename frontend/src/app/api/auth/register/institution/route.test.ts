import { describe, expect, it } from "vitest";
import { Wallet } from "ethers";
import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { jsonRequest } from "@/test/helpers";

async function signedWallet(message = "Link this wallet to my VeriCred institution account") {
  const wallet = Wallet.createRandom();
  const signature = await wallet.signMessage(message);
  return { address: wallet.address, message, signature };
}

function validBody(overrides: Record<string, unknown> = {}, wallet: { address: string; message: string; signature: string }) {
  return {
    organizationName: "Asia Pacific University",
    email: "registrar@apu.edu.my",
    username: "apu_registrar",
    password: "correct-horse-battery",
    confirmPassword: "correct-horse-battery",
    walletAddress: wallet.address,
    message: wallet.message,
    signature: wallet.signature,
    ...overrides,
  };
}

describe("POST /api/auth/register/institution", () => {
  it("creates a pending institution request, not an active issuer", async () => {
    const wallet = await signedWallet();

    const response = await POST(
      jsonRequest("http://localhost", { method: "POST", body: validBody({}, wallet) })
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.issuer.status).toBe("PENDING");

    const user = await prisma.user.findUnique({ where: { email: "registrar@apu.edu.my" } });
    expect(user?.role).toBe("USER");

    const issuer = await prisma.issuer.findUnique({ where: { userId: user!.id } });
    expect(issuer?.status).toBe("PENDING");
    expect(issuer?.walletAddress).toBe(wallet.address.toLowerCase());
    expect(issuer?.organizationName).toBe("Asia Pacific University");
  });

  it("leaves the contact account unverified and issues it a verification token", async () => {
    const wallet = await signedWallet();
    const response = await POST(
      jsonRequest("http://localhost", {
        method: "POST",
        body: validBody({ email: "records@apu.edu.my", username: "apu_records" }, wallet),
      })
    );
    expect(response.status).toBe(201);

    const user = await prisma.user.findUnique({ where: { email: "records@apu.edu.my" } });
    expect(user?.emailVerified).toBeNull();

    const token = await prisma.verificationToken.findFirst({ where: { identifier: user!.id } });
    expect(token).not.toBeNull();
  });

  it("soft-blocks a freemail contact email", async () => {
    const wallet = await signedWallet();
    const response = await POST(
      jsonRequest("http://localhost", {
        method: "POST",
        body: validBody({ email: "someone@gmail.com" }, wallet),
      })
    );
    expect(response.status).toBe(400);
  });

  it("rejects registration without a wallet signature", async () => {
    const wallet = await signedWallet();
    const response = await POST(
      jsonRequest("http://localhost", {
        method: "POST",
        body: validBody({ message: undefined, signature: undefined }, wallet),
      })
    );
    expect(response.status).toBe(400);
  });
});
