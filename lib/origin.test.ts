import { describe, expect, it } from "vitest";
import { needsOriginCheck, originMatchesHost } from "./origin";

describe("origin guard (CSRF)", () => {
  it("checks only state-changing methods", () => {
    expect(needsOriginCheck("POST")).toBe(true);
    expect(needsOriginCheck("delete")).toBe(true);
    expect(needsOriginCheck("GET")).toBe(false);
    expect(needsOriginCheck("HEAD")).toBe(false);
  });

  it("accepts the dashboard's own origin only", () => {
    expect(originMatchesHost("https://admin.wzrd.tech", "admin.wzrd.tech")).toBe(true);
    expect(originMatchesHost("https://ADMIN.wzrd.tech", "admin.wzrd.tech")).toBe(true);
    expect(originMatchesHost("http://localhost:3111", "localhost:3111")).toBe(true);
    // A sibling host of the same site carries the Lax cookie but is not us.
    expect(originMatchesHost("https://mini.wzrd.tech", "admin.wzrd.tech")).toBe(false);
    expect(originMatchesHost("https://link.wzrd.tech", "admin.wzrd.tech")).toBe(false);
    expect(originMatchesHost("https://admin.wzrd.tech.evil.com", "admin.wzrd.tech")).toBe(false);
  });

  it("refuses a missing or unparsable Origin", () => {
    expect(originMatchesHost(null, "admin.wzrd.tech")).toBe(false);
    expect(originMatchesHost("null", "admin.wzrd.tech")).toBe(false);
    expect(originMatchesHost("not a url", "admin.wzrd.tech")).toBe(false);
    expect(originMatchesHost("https://admin.wzrd.tech", null)).toBe(false);
  });
});
