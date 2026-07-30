import { describe, it, expect, vi } from "vitest";
import { POST } from "./route";
import { auth } from "@/lib/auth";
import { buildSession, createIssuerWithCourse, jsonRequest, mockAuthSession } from "@/test/helpers";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

describe("POST /api/courses/[id]/links", () => {
  it("lets the owning issuer create a collection link for their course", async () => {
    const { user, course } = await createIssuerWithCourse();
    mockAuthSession(auth, buildSession({ id: user.id, role: "ISSUER" }));

    const request = jsonRequest(`http://localhost/api/courses/${course.id}/links`, {
      method: "POST",
      body: { maxCollections: 5 },
    });

    const response = await POST(request, { params: Promise.resolve({ id: course.id }) });
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.link.courseId).toBe(course.id);
    expect(data.link.maxCollections).toBe(5);
    expect(data.link.currentCount).toBe(0);
    expect(typeof data.link.token).toBe("string");
  });

  it("rejects a different issuer trying to create a collection link for another issuer's course", async () => {
    const { course } = await createIssuerWithCourse();
    const { user: otherUser } = await createIssuerWithCourse();
    mockAuthSession(auth, buildSession({ id: otherUser.id, role: "ISSUER" }));

    const request = jsonRequest(`http://localhost/api/courses/${course.id}/links`, {
      method: "POST",
      body: { maxCollections: 5 },
    });

    const response = await POST(request, { params: Promise.resolve({ id: course.id }) });

    expect(response.status).toBe(404);
  });
});
