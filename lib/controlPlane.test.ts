import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { adminFetch, adminGet, adminGetSafe } from "./controlPlane";

describe("controlPlane client", () => {
  beforeEach(() => {
    process.env.CONTROL_PLANE_URL = "https://air.example.com/";
    process.env.ADMIN_API_KEY = "test-admin-key";
  });
  afterEach(() => {
    delete process.env.CONTROL_PLANE_URL;
    delete process.env.ADMIN_API_KEY;
    vi.restoreAllMocks();
  });

  it("attaches the bearer key server-side and strips the trailing slash", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    await adminFetch("/api/admin/tokens");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://air.example.com/api/admin/tokens",
      {
        headers: { Authorization: "Bearer test-admin-key" },
        cache: "no-store",
      }
    );
  });

  it("adminGet parses JSON and throws on non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ users: [] }), { status: 200 })
    );
    await expect(adminGet("/api/admin/tokens")).resolves.toEqual({
      users: [],
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 401 })
    );
    await expect(adminGet("/api/admin/tokens")).rejects.toThrow(
      "control plane 401"
    );
  });

  it("adminGetSafe reports errors instead of throwing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 500 })
    );
    const result = await adminGetSafe("/api/admin/boxes");
    expect(result.data).toBeNull();
    expect(result.error).toBe("control plane returned 500");
  });

  it("fails loudly when env vars are missing", async () => {
    delete process.env.ADMIN_API_KEY;
    const result = await adminGetSafe("/api/admin/boxes");
    expect(result.error).toBe("ADMIN_API_KEY is not configured");
  });
});
