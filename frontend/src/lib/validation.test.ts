import { describe, expect, it } from "vitest";
import { isFreemailDomain, isValidUsername } from "@/lib/validation";

describe("isValidUsername", () => {
  it("accepts a lowercase alphanumeric username within bounds", () => {
    expect(isValidUsername("edwin_dev-01")).toBe(true);
  });

  it("rejects usernames shorter than 3 or longer than 32 characters", () => {
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("a".repeat(33))).toBe(false);
    expect(isValidUsername("a".repeat(32))).toBe(true);
  });

  it("rejects uppercase letters and disallowed special characters", () => {
    expect(isValidUsername("Edwin")).toBe(false);
    expect(isValidUsername("edwin.dev")).toBe(false);
    expect(isValidUsername("edwin dev")).toBe(false);
  });
});

describe("isFreemailDomain", () => {
  it("flags common consumer email providers, case-insensitively", () => {
    expect(isFreemailDomain("someone@gmail.com")).toBe(true);
    expect(isFreemailDomain("someone@Yahoo.COM")).toBe(true);
  });

  it("does not flag an institutional domain", () => {
    expect(isFreemailDomain("registrar@apu.edu.my")).toBe(false);
  });
});
