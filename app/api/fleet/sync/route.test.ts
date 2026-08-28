import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

import { POST } from "./route";

const RELEASES = {
  releases: [
    { id: "rel-new", version: "2026.08.28-abc1234" },
    { id: "rel-old", version: "2026.08.27-def5678" },
  ],
};

function request(fields: Record<string, string>): NextRequest {
  const form = new URLSearchParams(fields);
  return new NextRequest("https://admin.example.com/api/fleet/sync", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

describe("POST /api/fleet/sync", () => {
  beforeEach(() => {
    process.env.CONTROL_PLANE_URL = "https://air.example.com";
    process.env.ADMIN_API_KEY = "test-admin-key";
  });
  afterEach(() => {
    delete process.env.CONTROL_PLANE_URL;
    delete process.env.ADMIN_API_KEY;
    vi.restoreAllMocks();
  });

  it("points a stale channel at the newest release, starts the job, and redirects", async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({
        url,
        method,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (url.endsWith("/api/admin/fleet/releases")) {
        return new Response(JSON.stringify(RELEASES));
      }
      if (url.endsWith("/api/admin/fleet/channels") && method === "GET") {
        return new Response(
          JSON.stringify({
            channels: [{ name: "prod", release_id: "rel-old" }],
          })
        );
      }
      return new Response(JSON.stringify({ ok: true }));
    });

    const response = await POST(request({ action: "sync", channel: "prod" }));
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/fleet");
    expect(
      calls.find(
        (c) => c.url.endsWith("/fleet/channels") && c.method === "POST"
      )?.body
    ).toEqual({ channel: "prod", release_id: "rel-new" });
    expect(
      calls.find((c) => c.url.endsWith("/fleet/sync") && c.method === "POST")
        ?.body
    ).toEqual({ channel: "prod" });
  });

  it("skips the channel repoint when already at the latest release", async () => {
    const posts: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method !== "GET") posts.push(url);
      if (url.endsWith("/api/admin/fleet/releases")) {
        return new Response(JSON.stringify(RELEASES));
      }
      if (url.endsWith("/api/admin/fleet/channels")) {
        return new Response(
          JSON.stringify({
            channels: [{ name: "prod", release_id: "rel-new" }],
          })
        );
      }
      return new Response(JSON.stringify({ ok: true }));
    });

    await POST(request({ action: "sync", channel: "prod" }));
    expect(posts).toEqual(["https://air.example.com/api/admin/fleet/sync"]);
  });

  it("surfaces upstream errors in the redirect query", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/admin/fleet/releases")) {
        return new Response(JSON.stringify(RELEASES));
      }
      if ((init?.method ?? "GET") === "GET") {
        return new Response(
          JSON.stringify({ channels: [{ name: "prod", release_id: "rel-new" }] })
        );
      }
      return new Response(
        JSON.stringify({ error: "a sync job is already in progress" }),
        { status: 409 }
      );
    });

    const response = await POST(request({ action: "sync", channel: "prod" }));
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("error")).toBe(
      "a sync job is already in progress"
    );
  });

  it("treats a 2xx response with an empty body as success", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/admin/fleet/releases")) {
        return new Response(JSON.stringify(RELEASES));
      }
      if ((init?.method ?? "GET") === "GET") {
        return new Response(
          JSON.stringify({ channels: [{ name: "prod", release_id: "rel-old" }] })
        );
      }
      return new Response(null, { status: 204 });
    });

    const response = await POST(request({ action: "sync", channel: "prod" }));
    expect(new URL(response.headers.get("location")!).search).toBe("");
  });

  it("patches the active job for pause/resume/abort", async () => {
    let patched: unknown = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (init?.method === "PATCH") patched = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ ok: true }));
    });

    const response = await POST(
      request({ action: "abort", channel: "prod", job_id: "job-1" })
    );
    expect(response.status).toBe(303);
    expect(patched).toEqual({ job_id: "job-1", action: "abort" });
  });

  it("rejects unknown actions and bad channels", async () => {
    const bad = await POST(request({ action: "sync", channel: "staging" }));
    expect(new URL(bad.headers.get("location")!).searchParams.get("error")).toBe(
      "channel must be dev or prod"
    );
    const unknown = await POST(request({ action: "destroy", channel: "prod" }));
    expect(
      new URL(unknown.headers.get("location")!).searchParams.get("error")
    ).toBe("unknown action");
  });
});
