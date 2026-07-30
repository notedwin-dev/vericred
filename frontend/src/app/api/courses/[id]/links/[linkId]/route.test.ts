import { describe, it, expect, vi } from "vitest";
import { PATCH } from "./route";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { buildSession, createIssuer, createIssuerWithCourse, jsonRequest, mockAuthSession } from "@/test/helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

async function seedLink(courseId: string, overrides: Partial<{ maxCollections: number; currentCount: number }> = {}) {
  return prisma.collectionLink.create({
    data: {
      courseId,
      maxCollections: overrides.maxCollections,
      currentCount: overrides.currentCount ?? 0,
    },
  });
}

function patchRequest(courseId: string, linkId: string, body: unknown) {
  return {
    request: jsonRequest(`http://localhost/api/courses/${courseId}/links/${linkId}`, { method: "PATCH", body }),
    params: Promise.resolve({ id: courseId, linkId }),
  };
}

describe("PATCH /api/courses/[id]/links/[linkId]", () => {
  it("lets the owning issuer update a link's limits and active state", async () => {
    const { user, course } = await createIssuerWithCourse();
    const link = await seedLink(course.id);
    mockAuthSession(auth, buildSession({ id: user.id, role: "ISSUER" }));

    const { request, params } = patchRequest(course.id, link.id, { maxCollections: 10, active: false });
    const response = await PATCH(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.link.maxCollections).toBe(10);
    expect(data.link.active).toBe(false);
  });

  it("clears a field when explicitly set to null", async () => {
    const { user, course } = await createIssuerWithCourse();
    const link = await seedLink(course.id, { maxCollections: 5 });
    mockAuthSession(auth, buildSession({ id: user.id, role: "ISSUER" }));

    const { request, params } = patchRequest(course.id, link.id, { maxCollections: null });
    const response = await PATCH(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.link.maxCollections).toBeNull();
  });

  it("refuses a maxCollections below the number already claimed", async () => {
    const { user, course } = await createIssuerWithCourse();
    const link = await seedLink(course.id, { maxCollections: 10, currentCount: 7 });
    mockAuthSession(auth, buildSession({ id: user.id, role: "ISSUER" }));

    const { request, params } = patchRequest(course.id, link.id, { maxCollections: 5 });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(400);
  });

  it("refuses to let a different issuer edit someone else's link", async () => {
    const { course } = await createIssuerWithCourse();
    const link = await seedLink(course.id);
    const { user: otherIssuer } = await createIssuer();
    mockAuthSession(auth, buildSession({ id: otherIssuer.id, role: "ISSUER" }));

    const { request, params } = patchRequest(course.id, link.id, { active: false });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(404);
  });

  it("rejects an empty body", async () => {
    const { user, course } = await createIssuerWithCourse();
    const link = await seedLink(course.id);
    mockAuthSession(auth, buildSession({ id: user.id, role: "ISSUER" }));

    const { request, params } = patchRequest(course.id, link.id, {});
    const response = await PATCH(request, { params });

    expect(response.status).toBe(400);
  });
});
