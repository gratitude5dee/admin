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
    ).toEqual({
      channel: "prod",
      release_id: "rel-new",
      expected_release_id: "rel-old",
    });
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

  it("passes the chosen canary and repins Hermes only when the release pins one", async () => {
    const bodies: unknown[] = [];
    const withHermes = {
      releases: [{ ...RELEASES.releases[0], hermes_ref: "29112bef" }],
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/api/admin/fleet/releases")) {
        return new Response(JSON.stringify(withHermes));
      }
      if (url.endsWith("/api/admin/fleet/channels")) {
        return new Response(
          JSON.stringify({ channels: [{ name: "prod", release_id: "rel-new" }] })
        );
      }
      if (url.endsWith("/api/admin/fleet/sync") && method === "POST") {
        bodies.push(JSON.parse(String(init?.body)));
      }
      return new Response(JSON.stringify({ ok: true }));
    });

    await POST(
      request({
        action: "sync",
        channel: "prod",
        canary_box_id: "bx_canary",
        include_hermes: "on",
      })
    );
    expect(bodies).toEqual([
      { channel: "prod", canary_box_ids: ["bx_canary"], include_hermes: true },
    ]);
  });

  it("leaves include_hermes off when the release has no hermes_ref", async () => {
    let body: unknown = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/admin/fleet/releases")) {
        return new Response(JSON.stringify(RELEASES));
      }
      if (url.endsWith("/api/admin/fleet/channels")) {
        return new Response(
          JSON.stringify({ channels: [{ name: "prod", release_id: "rel-new" }] })
        );
      }
      if (init?.method === "POST") body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ ok: true }));
    });

    await POST(
      request({ action: "sync", channel: "prod", include_hermes: "on" })
    );
    expect(body).toEqual({ channel: "prod" });
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

  /**
   * A control plane whose channel pointer honours expected_release_id the
   * way airv2 does (409 on mismatch, pointer untouched). `onSync` runs when
   * the sync job is requested and returns that request's response; it may
   * move the pointer to model another operator racing us.
   */
  function fakeControlPlane(
    initial: string | null,
    onSync: (cp: { pointer: string | null }) => Response,
    onAdvance?: (cp: { pointer: string | null }) => void
  ) {
    const cp = { pointer: initial, channelPosts: [] as unknown[], syncs: 0 };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/api/admin/fleet/releases")) {
        return new Response(JSON.stringify(RELEASES));
      }
      if (url.endsWith("/api/admin/fleet/channels")) {
        if (method === "POST") {
          const body = JSON.parse(String(init?.body)) as {
            release_id: string;
            expected_release_id?: string | null;
          };
          cp.channelPosts.push(body);
          if (cp.channelPosts.length === 1) onAdvance?.(cp);
          if (
            body.expected_release_id !== undefined &&
            body.expected_release_id !== cp.pointer
          ) {
            return new Response(
              JSON.stringify({ error: `channel prod moved to ${cp.pointer}` }),
              { status: 409 }
            );
          }
          cp.pointer = body.release_id;
          return new Response(JSON.stringify({ ok: true }));
        }
        return new Response(
          JSON.stringify({ channels: [{ name: "prod", release_id: cp.pointer }] })
        );
      }
      cp.syncs += 1;
      return onSync(cp);
    });
    return cp;
  }

  function errorOf(response: Response): string | null {
    return new URL(response.headers.get("location")!).searchParams.get("error");
  }

  it("advances with a compare-and-set on the pointer it read", async () => {
    const cp = fakeControlPlane("rel-old", () =>
      new Response(JSON.stringify({ ok: true }))
    );

    const response = await POST(request({ action: "sync", channel: "prod" }));
    expect(errorOf(response)).toBeNull();
    expect(cp.channelPosts).toEqual([
      { channel: "prod", release_id: "rel-new", expected_release_id: "rel-old" },
    ]);
    expect(cp.syncs).toBe(1);
  });

  it("puts the channel back when the job is rejected after the pointer advanced", async () => {
    const cp = fakeControlPlane(
      "rel-old",
      () =>
        new Response(
          JSON.stringify({ error: "no requested canary box is syncable on prod" }),
          { status: 409 }
        )
    );

    const response = await POST(
      request({ action: "sync", channel: "prod", canary_box_id: "bx_gone" })
    );
    expect(errorOf(response)).toBe("no requested canary box is syncable on prod");
    expect(cp.channelPosts).toEqual([
      { channel: "prod", release_id: "rel-new", expected_release_id: "rel-old" },
      { channel: "prod", release_id: "rel-old", expected_release_id: "rel-new" },
    ]);
    expect(cp.pointer).toBe("rel-old");
  });

  it("keeps the original error when the rollback is refused because the channel moved on", async () => {
    // Another operator moves the pointer to rel-other while our sync request
    // is in flight: the conditional restore 409s and their target survives.
    const cp = fakeControlPlane("rel-old", (state) => {
      state.pointer = "rel-other";
      return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
    });

    const response = await POST(request({ action: "sync", channel: "prod" }));
    expect(errorOf(response)).toBe("boom");
    expect(cp.channelPosts).toEqual([
      { channel: "prod", release_id: "rel-new", expected_release_id: "rel-old" },
      { channel: "prod", release_id: "rel-old", expected_release_id: "rel-new" },
    ]);
    expect(cp.pointer).toBe("rel-other");
  });

  it("syncs without owning the move when someone else already advanced to latest", async () => {
    // Between our read (rel-old) and our advance, another operator pointed
    // the channel at rel-new. Our CAS 409s; we still start the job, and a
    // failed job must not roll their move back.
    const cp = fakeControlPlane(
      "rel-old",
      () => new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
      (state) => {
        state.pointer = "rel-new";
      }
    );

    const response = await POST(request({ action: "sync", channel: "prod" }));
    expect(errorOf(response)).toBe("boom");
    expect(cp.channelPosts).toEqual([
      { channel: "prod", release_id: "rel-new", expected_release_id: "rel-old" },
    ]);
    expect(cp.syncs).toBe(1);
    expect(cp.pointer).toBe("rel-new");
  });

  it("stops without starting a job when someone else moved the channel elsewhere", async () => {
    const cp = fakeControlPlane(
      "rel-old",
      () => new Response(JSON.stringify({ ok: true })),
      (state) => {
        state.pointer = "rel-other";
      }
    );

    const response = await POST(request({ action: "sync", channel: "prod" }));
    expect(errorOf(response)).toMatch(/moved by someone else/);
    expect(cp.channelPosts).toEqual([
      { channel: "prod", release_id: "rel-new", expected_release_id: "rel-old" },
    ]);
    expect(cp.syncs).toBe(0);
    expect(cp.pointer).toBe("rel-other");
  });

  it("expects a null pointer when the channel has never been set", async () => {
    const cp = fakeControlPlane(null, () =>
      new Response(JSON.stringify({ ok: true }))
    );

    await POST(request({ action: "sync", channel: "prod" }));
    expect(cp.channelPosts).toEqual([
      { channel: "prod", release_id: "rel-new", expected_release_id: null },
    ]);
    expect(cp.pointer).toBe("rel-new");
  });

  it("does not touch the channel on failure when it was already at the latest release", async () => {
    const channelPosts: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.endsWith("/api/admin/fleet/releases")) {
        return new Response(JSON.stringify(RELEASES));
      }
      if (url.endsWith("/api/admin/fleet/channels")) {
        if (method === "POST") channelPosts.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({ channels: [{ name: "prod", release_id: "rel-new" }] })
        );
      }
      return new Response(
        JSON.stringify({ error: "a sync job is already in progress" }),
        { status: 409 }
      );
    });

    await POST(request({ action: "sync", channel: "prod" }));
    expect(channelPosts).toEqual([]);
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
