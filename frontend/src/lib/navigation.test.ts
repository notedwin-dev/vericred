import { describe, expect, it } from "vitest";
import { activeNavHref, buildNavItems, roleBadge, roleHome } from "./navigation";

const labels = (role: Parameters<typeof buildNavItems>[0]) =>
  buildNavItems(role).map((i) => i.label);

describe("roleHome", () => {
  it("sends an ordinary user to their credentials", () => {
    expect(roleHome("USER")).toBe("/dashboard");
  });

  it("sends an issuer and an admin to the area they are actually redirected to", () => {
    // /dashboard bounces both roles straight back out, so linking them there
    // is a round-trip with no destination of its own.
    expect(roleHome("ISSUER")).toBe("/issuer");
    expect(roleHome("ADMIN")).toBe("/admin");
  });
});

describe("roleBadge", () => {
  it("labels privileged contexts and leaves an ordinary account unlabelled", () => {
    expect(roleBadge("ISSUER")).toBe("Issuer");
    expect(roleBadge("ADMIN")).toBe("Admin");
    expect(roleBadge("USER")).toBeNull();
  });
});

describe("buildNavItems", () => {
  it("gives an ordinary user their credentials and settings", () => {
    expect(labels("USER")).toEqual(["Dashboard", "Settings"]);
  });

  it("does not give an issuer a tab telling them they are an issuer", () => {
    // The whole point: the badge states the context, so a second entry
    // pointing at the same place as Dashboard is noise.
    expect(labels("ISSUER")).toEqual(["Dashboard", "Settings"]);
  });

  it("points an issuer's Dashboard at the issuer panel, not a redirect", () => {
    expect(buildNavItems("ISSUER")[0].href).toBe("/issuer");
  });

  it("keeps Issuer for an admin, where it is a different area from their home", () => {
    expect(labels("ADMIN")).toEqual(["Dashboard", "Issuer", "Settings"]);
    expect(buildNavItems("ADMIN")[0].href).toBe("/admin");
  });

  it("never lists the same destination twice", () => {
    for (const role of ["USER", "ISSUER", "ADMIN"] as const) {
      const hrefs = buildNavItems(role).map((i) => i.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
  });
});

describe("activeNavHref", () => {
  it("marks settings active without also lighting up Dashboard", () => {
    // /dashboard/settings also starts with /dashboard — a first-match scan
    // highlighted both at once.
    const items = buildNavItems("USER");
    expect(activeNavHref("/dashboard/settings", items)).toBe("/dashboard/settings");
  });

  it("marks Dashboard active on the dashboard itself", () => {
    expect(activeNavHref("/dashboard", buildNavItems("USER"))).toBe("/dashboard");
  });

  it("keeps an issuer's Dashboard active on nested issuer pages", () => {
    expect(activeNavHref("/issuer/courses/abc", buildNavItems("ISSUER"))).toBe("/issuer");
  });

  it("distinguishes an admin's two areas", () => {
    const items = buildNavItems("ADMIN");
    expect(activeNavHref("/admin", items)).toBe("/admin");
    expect(activeNavHref("/issuer/templates", items)).toBe("/issuer");
  });

  it("matches nothing on an unrelated path", () => {
    expect(activeNavHref("/verify", buildNavItems("USER"))).toBeNull();
    expect(activeNavHref(null, buildNavItems("USER"))).toBeNull();
  });
});
