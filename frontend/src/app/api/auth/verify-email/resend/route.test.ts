import { randomBytes } from "crypto";
import { describe, expect, it } from "vitest";
import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { jsonRequest } from "@/test/helpers";

function resend(email: unknown) {
  return POST(jsonRequest("http://localhost", { method: "POST", body: { email } }));
}

describe("POST /api/auth/verify-email/resend", () => {
  it("issues a fresh token for an unverified account, replacing the old one", async () => {
    const user = await prisma.user.create({
      data: { name: "Stuck", email: "stuck@example.test", passwordHash: "x", role: "USER" },
    });
    const stale = randomBytes(32).toString("hex");
    await prisma.verificationToken.create({
      data: {
        identifier: user.id,
        token: stale,
        expires: new Date(Date.now() + 3600_000),
        createdAt: new Date(Date.now() - 10 * 60 * 1000), // outside the resend cooldown
      },
    });

    const response = await resend("stuck@example.test");
    expect(response.status).toBe(200);

    const tokens = await prisma.verificationToken.findMany({ where: { identifier: user.id } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].token).not.toBe(stale);
  });

  it("keeps the existing token when asked again inside the cooldown", async () => {
    const user = await prisma.user.create({
      data: { name: "Impatient", email: "impatient@example.test", passwordHash: "x", role: "USER" },
    });
    const justIssued = randomBytes(32).toString("hex");
    await prisma.verificationToken.create({
      data: { identifier: user.id, token: justIssued, expires: new Date(Date.now() + 3600_000) },
    });

    const response = await resend("impatient@example.test");

    expect(response.status).toBe(200);
    const tokens = await prisma.verificationToken.findMany({ where: { identifier: user.id } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].token).toBe(justIssued);
  });

  it("does not reveal whether an unknown email has an account", async () => {
    const response = await resend("nobody@example.test");

    expect(response.status).toBe(200);
    expect(await prisma.verificationToken.count()).toBe(0);
  });

  it("issues nothing for an account that is already verified", async () => {
    const user = await prisma.user.create({
      data: {
        name: "Done",
        email: "done@example.test",
        passwordHash: "x",
        emailVerified: new Date(),
        role: "USER",
      },
    });

    const response = await resend("done@example.test");

    expect(response.status).toBe(200);
    expect(await prisma.verificationToken.count({ where: { identifier: user.id } })).toBe(0);
  });

  it("rejects a malformed email", async () => {
    const response = await resend("not-an-email");
    expect(response.status).toBe(400);
  });
});
