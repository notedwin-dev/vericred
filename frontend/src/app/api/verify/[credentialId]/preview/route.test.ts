import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { prisma } from "@/lib/prisma";
import { createIssuerWithCourse } from "@/test/helpers";

function previewRequest(credentialId: string, headers: Record<string, string> = {}) {
  return {
    request: new NextRequest(`http://localhost/api/verify/${credentialId}/preview`, { headers }),
    params: Promise.resolve({ credentialId }),
  };
}

async function seedCertificate(grade: string | null = null) {
  const { course } = await createIssuerWithCourse();
  return prisma.certificate.create({
    data: {
      credentialId: "VC-2026-PREVIEW1",
      recipientName: "Ada Lovelace",
      courseId: course.id,
      status: "ACTIVE",
      issuedAt: new Date("2026-08-06T00:00:00Z"),
      grade,
    },
  });
}

describe("GET /api/verify/[credentialId]/preview", () => {
  it("renders a PNG from the database", async () => {
    const cert = await seedCertificate();
    const { request, params } = previewRequest(cert.credentialId);

    const response = await GET(request, { params });
    const body = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(body.subarray(1, 4).toString("ascii")).toBe("PNG");
  }, 30000);

  it("draws the same image whether or not the certificate has a grade", async () => {
    // The public representation must be unaffected by the award grade — that
    // is the privacy split. Asserted by byte-comparison rather than searching
    // for the string, because PNG is compressed and a substring check would
    // pass whether or not the grade were drawn.
    const cert = await seedCertificate(null);

    const first = await GET(...toArgs(previewRequest(cert.credentialId)));
    const withoutGrade = Buffer.from(await first.arrayBuffer());

    await prisma.certificate.update({
      where: { id: cert.id },
      data: { grade: "First Class Honours" },
    });

    const second = await GET(...toArgs(previewRequest(cert.credentialId)));
    const withGrade = Buffer.from(await second.arrayBuffer());

    expect(withGrade.equals(withoutGrade)).toBe(true);
  }, 60000);

  it("serves 304 without re-rendering when the client already has it", async () => {
    const cert = await seedCertificate();
    const first = await GET(...toArgs(previewRequest(cert.credentialId)));
    const etag = first.headers.get("etag")!;
    expect(etag).toBeTruthy();

    const second = await GET(...toArgs(previewRequest(cert.credentialId, { "if-none-match": etag })));

    expect(second.status).toBe(304);
    expect((await second.arrayBuffer()).byteLength).toBe(0);
  }, 30000);

  it("404s for a credential that does not exist", async () => {
    const { request, params } = previewRequest("VC-2026-NOSUCH1");

    expect((await GET(request, { params })).status).toBe(404);
  });
});

/** Adapts the helper's object into GET's positional arguments. */
function toArgs(built: ReturnType<typeof previewRequest>) {
  return [built.request, { params: built.params }] as const;
}
