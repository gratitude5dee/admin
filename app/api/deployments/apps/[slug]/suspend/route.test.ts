import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

import { POST } from "./route";

function request(slug = "alice-tour"): NextRequest {
  return new NextRequest(
    `https://admin.example.com/api/deployments/apps/${encodeURIComponent(slug)}/suspend`,
    { method: "POST", body: new URLSearchParams() }
  );
}

const withSlug = (slug: string) => ({ params: Promise.resolve({ slug }) });

function location(response: Response): URL {
  return new URL(response.headers.get("location")!);
}

describe("POST /api/deployments/apps/[slug]/suspend", () => {
  beforeEach(() => {
    vi.stubEnv("CONTROL_PLANE_URL", "https://air.example.com");
    vi.stubEnv("ADMIN_API_KEY", "test-admin-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("forwards the suspension with the bearer and redirects back to /deployments", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ ok: true, slug: "alice-tour", action: "suspend" }));

    const response = await POST(request(), withSlug("alice-tour"));

    expect(response.status).toBe(303);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://air.example.com/api/admin/create/apps/alice-tour/suspend",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-admin-key",
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    );
    const url = location(response);
    expect(url.pathname).toBe("/deployments");
    expect(url.search).toBe("");
    expect(response.headers.get("location")).not.toContain("test-admin-key");
  });

  it.each(["Alice-Tour", "-tour", "a/b", "a".repeat(65), ""])(
    "rejects slug %j without calling the control plane",
    async (slug) => {
      const fetch = vi.spyOn(globalThis, "fetch");
      const response = await POST(request(slug), withSlug(slug));
      expect(location(response).pathname).toBe("/deployments");
      expect(location(response).searchParams.get("error")).toBe("invalid app slug");
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it("surfaces an upstream 404 (unknown app) in the redirect", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ error: "app ghost not found" }, { status: 404 })
    );
    const response = await POST(request("ghost"), withSlug("ghost"));
    expect(response.status).toBe(303);
    expect(location(response).searchParams.get("error")).toBe("app ghost not found");
  });

  it("falls back to the status when the upstream error body is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("bad gateway", { status: 502 })
    );
    const response = await POST(request(), withSlug("alice-tour"));
    expect(location(response).searchParams.get("error")).toBe("control plane returned 502");
  });

  it("reports an unreachable control plane instead of crashing", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    const response = await POST(request(), withSlug("alice-tour"));
    expect(location(response).searchParams.get("error")).toBe("fetch failed");
  });

  it("returns to the view the form came from", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const response = await POST(
      new NextRequest("https://admin.example.com/api/deployments/apps/alice-tour/suspend", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ days: "7", channel: "prod" }).toString(),
      }),
      { params: Promise.resolve({ slug: "alice-tour" }) }
    );
    expect(response.status).toBe(303);
    const url = new URL(response.headers.get("location")!);
    expect(url.pathname).toBe("/deployments");
    expect(url.searchParams.get("days")).toBe("7");
    expect(url.searchParams.get("channel")).toBe("prod");
    expect(url.searchParams.get("error")).toBeNull();
  });
});
