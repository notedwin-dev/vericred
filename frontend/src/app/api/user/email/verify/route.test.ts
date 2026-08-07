import { randomBytes } from "crypto";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { prisma } from "@/lib/prisma";

async function tokenFor(userId: string, expires = new Date(Date.now() + 3600_000)) {
  const token = randomBytes(32).toString("hex");
  await prisma.verificationToken.create({ data: { identifier: userId, token, expires } });
  return token;
}

function verifyRequest(token: string) {
  return new NextRequest(`http://localhost/api/user/email/verify?token=${token}`);
}

describe("GET /api/user/email/verify", () => {
  it("verifies a freshly-registered account that has no pending email staged", async () => {
    const user = await prisma.user.create({
      data: { name: "New Signup", email: "fresh@example.test", passwordHash: "x", role: "USER" },
    });
    const token = await tokenFor(user.id);

    const response = await GET(verifyRequest(token));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");

    const verified = await prisma.user.findUnique({ where: { id: user.id } });
    expect(verified?.emailVerified).not.toBeNull();
    expect(verified?.email).toBe("fresh@example.test");
  });

  it("still promotes a staged pendingEmail for a wallet-first account", async () => {
    const user = await prisma.user.create({
      data: { walletAddress: `0x${randomBytes(20).toString("hex")}`, pendingEmail: "staged@example.test", role: "USER" },
    });
    const token = await tokenFor(user.id);

    const response = await GET(verifyRequest(token));

    expect(response.headers.get("location")).toContain("/dashboard/settings");

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated?.email).toBe("staged@example.test");
    expect(updated?.pendingEmail).toBeNull();
    expect(updated?.emailVerified).not.toBeNull();
  });

  it("consumes the token so the same link can't be replayed", async () => {
    const user = await prisma.user.create({
      data: { name: "Replay", email: "replay@example.test", passwordHash: "x", role: "USER" },
    });
    const token = await tokenFor(user.id);

    await GET(verifyRequest(token));
    const second = await GET(verifyRequest(token));

    expect(second.headers.get("location")).toContain("emailError");
  });

  it("refuses an expired token", async () => {
    const user = await prisma.user.create({
      data: { name: "Expired", email: "expired@example.test", passwordHash: "x", role: "USER" },
    });
    const token = await tokenFor(user.id, new Date(Date.now() - 1000));

    const response = await GET(verifyRequest(token));

    expect(response.headers.get("location")).toContain("emailError=expired");

    const stillUnverified = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stillUnverified?.emailVerified).toBeNull();
  });
});
