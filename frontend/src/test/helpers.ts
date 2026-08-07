import { randomBytes, randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/types";

interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: Role;
  username: string | null;
  walletAddress: string | null;
  pendingEmail: string | null;
}

export function buildSession(overrides: Partial<SessionUser> & { id: string }) {
  const user: SessionUser = {
    name: "Test User",
    email: `${overrides.id}@example.test`,
    image: null,
    role: "USER",
    username: null,
    walletAddress: null,
    pendingEmail: null,
    ...overrides,
  };
  return { user, expires: new Date(Date.now() + 3600_000).toISOString() };
}

export async function createUser(overrides: Partial<{ role: Role; name: string; email: string }> = {}) {
  return prisma.user.create({
    data: {
      name: overrides.name ?? "Test User",
      email: overrides.email ?? `${randomUUID()}@example.test`,
      role: overrides.role ?? "USER",
    },
  });
}

/** Creates a USER-role account plus the Issuer profile the issuer routes look up by userId. */
export async function createIssuer(overrides: Partial<{ organizationName: string }> = {}) {
  const user = await prisma.user.create({
    data: { name: "Test Issuer", email: `${randomUUID()}@example.test`, role: "ISSUER" },
  });
  const issuer = await prisma.issuer.create({
    data: {
      userId: user.id,
      organizationName: overrides.organizationName ?? "Test University",
      walletAddress: `0x${randomBytes(20).toString("hex")}`,
      status: "APPROVED",
    },
  });
  return { user, issuer };
}

export async function createTemplate(issuerId: string) {
  return prisma.certificateTemplate.create({
    data: { issuerId, name: "Test Template", layout: { title: "{{name}}" } },
  });
}

export async function createCourse(issuerId: string, templateId: string, overrides: Partial<{ name: string }> = {}) {
  return prisma.course.create({
    data: { issuerId, templateId, name: overrides.name ?? "Test Course" },
  });
}

/** Full issuer + template + course setup, for tests that just need "a course to issue into." */
export async function createIssuerWithCourse() {
  const { user, issuer } = await createIssuer();
  const template = await createTemplate(issuer.id);
  const course = await createCourse(issuer.id, template.id);
  return { user, issuer, template, course };
}

/**
 * `auth` from lib/auth.ts is NextAuth v5's overloaded export (session-getter
 * *and* route-handler-wrapper), which confuses `vi.mocked(auth).mockResolvedValue`'s
 * overload resolution. Set the mock return value through this cast instead.
 */
export function mockAuthSession(authFn: unknown, session: ReturnType<typeof buildSession> | null) {
  (authFn as { mockResolvedValue: (value: unknown) => void }).mockResolvedValue(session);
}

export function jsonRequest(url: string, options: { method: string; body?: unknown }) {
  return new NextRequest(url, {
    method: options.method,
    headers: { "content-type": "application/json" },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}
