import { describe, expect, it } from "vitest";
import { canManageShares } from "./certificate-share";

const session = (id: string, role: string) => ({ user: { id, role } });

describe("canManageShares", () => {
  it("lets the recipient share their own certificate", () => {
    expect(canManageShares({ recipientId: "user-1" }, session("user-1", "USER"))).toBe(true);
  });

  it("lets an admin act on the holder's behalf", () => {
    expect(canManageShares({ recipientId: "user-1" }, session("admin-1", "ADMIN"))).toBe(true);
  });

  it("refuses the issuing institution", () => {
    // The issuer authored the certificate, but onward disclosure of the
    // holder's document is the holder's decision, not theirs.
    expect(canManageShares({ recipientId: "user-1" }, session("issuer-1", "ISSUER"))).toBe(false);
  });

  it("refuses an unrelated account", () => {
    expect(canManageShares({ recipientId: "user-1" }, session("stranger", "USER"))).toBe(false);
  });

  it("refuses everyone on an unclaimed certificate", () => {
    // recipientId is null until someone claims it — nobody may share a
    // document that has no holder yet.
    expect(canManageShares({ recipientId: null }, session("user-1", "USER"))).toBe(false);
  });
});
