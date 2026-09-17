import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

import { POST } from "./route";

function request(fields: Record<string, string>, slug = "alice-tour"): NextRequest {
  return new NextRequest(
    `https://admin.example.com/api/deployments/apps/${encodeURIComponent(slug)}/dev`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    }
  );
}

const withSlug = (slug: string) => ({ params: Promise.resolve({ slug }) });

function location(response: Response): URL {
  return new URL(response.headers.get("location")!);
}

describe("POST /api/deployments/apps/[slug]/dev", () => {
  beforeEach(() => {
    vi.stubEnv("CONTROL_PLANE_URL", "https://air.example.com");
    vi.stubEnv("ADMIN_API_KEY", "test-admin-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("forwards revoke with the bearer and redirects back to /deployments", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ ok: true, slug: "alice-tour", action: "revoke" }));

    const response = await POST(request({ action: "revoke" }), withSlug("alice-tour"));

    expect(response.status).toBe(303);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://air.example.com/api/admin/create/apps/alice-tour/dev",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "revoke" }),
      })
    );
    const url = location(response);
    expect(url.pathname).toBe("/deployments");
    expect(url.search).toBe("");
    expect(response.headers.get("location")).not.toContain("test-admin-key");
  });

  it("forwards renew as its own action", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true }));
    await POST(request({ action: "renew" }), withSlug("bob_notes"));
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://air.example.com/api/admin/create/apps/bob_notes/dev"
    );
    expect(fetch.mock.calls[0]?.[1]?.body).toBe('{"action":"renew"}');
  });

  it.each(["Alice-Tour", "-tour", "_tour", "a/b", "a".repeat(65), "", "alice tour"])(
    "rejects slug %j without calling the control plane",
    async (slug) => {
      const fetch = vi.spyOn(globalThis, "fetch");
      const response = await POST(request({ action: "revoke" }), withSlug(slug));
      expect(response.status).toBe(303);
      expect(location(response).pathname).toBe("/deployments");
      expect(location(response).searchParams.get("error")).toBe("invalid app slug");
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it.each<Record<string, string>>([{ action: "suspend" }, { action: "destroy" }, {}])(
    "rejects action %j without calling the control plane",
    async (fields) => {
      const fetch = vi.spyOn(globalThis, "fetch");
      const response = await POST(request(fields), withSlug("alice-tour"));
      expect(location(response).searchParams.get("error")).toBe(
        "action must be revoke or renew"
      );
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it("surfaces the control plane's error message in the redirect", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ error: "app alice-tour has no dev release to renew" }, { status: 409 })
    );
    const response = await POST(request({ action: "renew" }), withSlug("alice-tour"));
    expect(response.status).toBe(303);
    const url = location(response);
    expect(url.pathname).toBe("/deployments");
    expect(url.searchParams.get("error")).toBe("app alice-tour has no dev release to renew");
  });

  it("falls back to the status when the upstream error body is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("upstream exploded", { status: 500 })
    );
    const response = await POST(request({ action: "revoke" }), withSlug("alice-tour"));
    expect(location(response).searchParams.get("error")).toBe("control plane returned 500");
  });

  it("reports an unreachable control plane instead of crashing", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    const response = await POST(request({ action: "revoke" }), withSlug("alice-tour"));
    expect(location(response).searchParams.get("error")).toBe("fetch failed");
  });

  it("treats a 2xx with an empty body as success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const response = await POST(request({ action: "revoke" }), withSlug("alice-tour"));
    expect(location(response).search).toBe("");
  });

  it("returns to the view the form came from, keeping the filters and the error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ error: "app alice-tour has no dev release to renew" }, { status: 409 })
    );
    const response = await POST(
      request({ action: "renew", days: "7", channel: "dev", user_id: "5b4e9c0a-2f1d-4b8a-9c3e-1a2b3c4d5e6f" }),
      withSlug("alice-tour")
    );
    const url = location(response);
    expect(url.pathname).toBe("/deployments");
    expect(url.searchParams.get("days")).toBe("7");
    expect(url.searchParams.get("channel")).toBe("dev");
    expect(url.searchParams.get("user_id")).toBe("5b4e9c0a-2f1d-4b8a-9c3e-1a2b3c4d5e6f");
    expect(url.searchParams.get("error")).toBe("app alice-tour has no dev release to renew");
  });

  it("drops view values the page would not accept", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const response = await POST(
      request({ action: "revoke", days: "7d", channel: "all", user_id: "alice" }),
      withSlug("alice-tour")
    );
    expect(location(response).search).toBe("");
  });

  it("answers a non-form body with the redirect and a reason, never a 500", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new NextRequest("https://admin.example.com/api/deployments/apps/alice-tour/dev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke" }),
      }),
      withSlug("alice-tour")
    );
    expect(response.status).toBe(303);
    expect(location(response).searchParams.get("error")).toBe("expected a form submission");
    expect(fetch).not.toHaveBeenCalled();
  });
});
