import { describe, expect, it } from "vitest";
import { buildInstitutionWelcomeEmail } from "./email-templates";

const email = () =>
  buildInstitutionWelcomeEmail({
    organizationName: "Asia Pacific University",
    getStartedUrl: "https://vericred.test/login/institution?callbackUrl=%2Fissuer",
  });

describe("buildInstitutionWelcomeEmail", () => {
  it("greets the institution by name", () => {
    const { subject, html, text } = email();

    expect(subject).toContain("Asia Pacific University");
    expect(html).toContain("Asia Pacific University");
    expect(text).toContain("Asia Pacific University");
  });

  it("points the Get Started button at the issuer dashboard", () => {
    const { html, text } = email();

    expect(html).toContain("https://vericred.test/login/institution?callbackUrl=%2Fissuer");
    expect(html).toContain("Get Started");
    expect(text).toContain("https://vericred.test/login/institution?callbackUrl=%2Fissuer");
  });

  it("walks through what the institution can do, as a numbered list", () => {
    const { html } = email();

    expect(html).toContain("<ol");
    expect((html.match(/<li/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("ships a plain-text alternative for clients that won't render HTML", () => {
    const { text } = email();

    expect(text).not.toContain("<");
    expect(text.length).toBeGreaterThan(100);
  });

  it("escapes an organisation name containing HTML so it can't inject markup", () => {
    const { html } = buildInstitutionWelcomeEmail({
      organizationName: '<script>alert("x")</script>',
      getStartedUrl: "https://vericred.test/issuer",
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
