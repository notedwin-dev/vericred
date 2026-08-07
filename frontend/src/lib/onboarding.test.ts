import { describe, expect, it } from "vitest";
import { needsOnboarding } from "./onboarding";

describe("needsOnboarding", () => {
  it("gates an OAuth account that has neither a username nor a wallet", () => {
    expect(needsOnboarding({ role: "USER", username: null, walletAddress: null })).toBe(true);
  });

  it("still gates an account that picked a username but never linked a wallet", () => {
    expect(needsOnboarding({ role: "USER", username: "ada", walletAddress: null })).toBe(true);
  });

  it("still gates an account that linked a wallet but never picked a username", () => {
    expect(needsOnboarding({ role: "USER", username: null, walletAddress: "0xabc" })).toBe(true);
  });

  it("lets a fully set up account through", () => {
    expect(needsOnboarding({ role: "USER", username: "ada", walletAddress: "0xabc" })).toBe(false);
  });

  it("exempts institution and platform accounts, whose wallet lives on the Issuer record", () => {
    expect(needsOnboarding({ role: "ISSUER", username: null, walletAddress: null })).toBe(false);
    expect(needsOnboarding({ role: "ADMIN", username: null, walletAddress: null })).toBe(false);
  });
});
