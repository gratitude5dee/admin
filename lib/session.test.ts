import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSessionCookie,
  passwordMatches,
  verifySessionCookie,
} from "./session";

describe("session cookie", () => {
  beforeEach(() => {
    process.env.DASHBOARD_PASSWORD = "test-password";
    delete process.env.SESSION_SECRET;
  });
  afterEach(() => {
    delete process.env.DASHBOARD_PASSWORD;
    delete process.env.SESSION_SECRET;
  });

  it("round-trips a signed cookie", async () => {
    const cookie = await createSessionCookie();
    expect(cookie).not.toBeNull();
    expect(await verifySessionCookie(cookie!)).toBe(true);
  });

  it("is idempotent to verify", async () => {
    const cookie = await createSessionCookie();
    expect(await verifySessionCookie(cookie!)).toBe(true);
    expect(await verifySessionCookie(cookie!)).toBe(true);
  });

  it("rejects a tampered signature", async () => {
    const cookie = await createSessionCookie();
    const [expires] = cookie!.split(".");
    expect(await verifySessionCookie(`${expires}.${"0".repeat(64)}`)).toBe(
      false
    );
  });

  it("rejects a tampered expiry", async () => {
    const cookie = await createSessionCookie();
    const [expires, sig] = cookie!.split(".");
    expect(
      await verifySessionCookie(`${Number(expires) + 1000}.${sig}`)
    ).toBe(false);
  });

  it("rejects an expired cookie", async () => {
    const cookie = await createSessionCookie(Date.now() - 24 * 3600_000);
    expect(await verifySessionCookie(cookie!)).toBe(false);
  });

  it("rejects missing/malformed values", async () => {
    expect(await verifySessionCookie(undefined)).toBe(false);
    expect(await verifySessionCookie("")).toBe(false);
    expect(await verifySessionCookie("not-a-cookie")).toBe(false);
  });

  it("uses SESSION_SECRET when set", async () => {
    process.env.SESSION_SECRET = "different-secret";
    const cookie = await createSessionCookie();
    expect(await verifySessionCookie(cookie!)).toBe(true);
    delete process.env.SESSION_SECRET;
    // signed with SESSION_SECRET, so the password-derived key must reject it
    expect(await verifySessionCookie(cookie!)).toBe(false);
  });

  it("returns null when no secret is configured", async () => {
    delete process.env.DASHBOARD_PASSWORD;
    expect(await createSessionCookie()).toBeNull();
  });
});

describe("passwordMatches", () => {
  beforeEach(() => {
    process.env.DASHBOARD_PASSWORD = "5dee";
  });
  afterEach(() => {
    delete process.env.DASHBOARD_PASSWORD;
  });

  it("accepts the configured password", () => {
    expect(passwordMatches("5dee")).toBe(true);
  });

  it("rejects wrong passwords and prefixes", () => {
    expect(passwordMatches("wrong")).toBe(false);
    expect(passwordMatches("5de")).toBe(false);
    expect(passwordMatches("5deee")).toBe(false);
    expect(passwordMatches("")).toBe(false);
  });

  it("rejects everything when unconfigured", () => {
    delete process.env.DASHBOARD_PASSWORD;
    expect(passwordMatches("5dee")).toBe(false);
  });
});
