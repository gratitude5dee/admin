import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

import { POST } from "./route";

function request(
  fields: Record<string, string>,
  artifact = new File([new Uint8Array([0x1f, 0x8b, 0x08])], "template.tgz", {
    type: "application/gzip",
  })
): NextRequest {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  form.set("artifact", artifact);
  return new NextRequest("https://admin.example.com/api/fleet/releases", {
    method: "POST",
    body: form,
  });
}

describe("POST /api/fleet/releases", () => {
  beforeEach(() => {
    process.env.CONTROL_PLANE_URL = "https://air.example.com";
    process.env.ADMIN_API_KEY = "test-admin-key";
  });

  afterEach(() => {
    delete process.env.CONTROL_PLANE_URL;
    delete process.env.ADMIN_API_KEY;
    vi.restoreAllMocks();
  });

  it("forwards a validated artifact through the server-side admin key", async () => {
    let body: Record<string, unknown> | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      expect(String(input)).toBe("https://air.example.com/api/admin/fleet/releases");
      expect(init?.headers).toEqual({
        Authorization: "Bearer test-admin-key",
        "Content-Type": "application/json",
      });
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ release: { id: "rel-1" } }), {
        status: 201,
      });
    });

    const response = await POST(
      request({
        version: "2026.09.15-bedeb28",
        git_sha: "bedeb28fc28e346d25b031cd3b2b9685c67bde1f",
        hermes_ref: "29112be",
        notes: "Kernel-first shopping browser",
      })
    );

    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/fleet");
    expect(location.searchParams.get("released")).toBe("2026.09.15-bedeb28");
    expect(body).toEqual({
      version: "2026.09.15-bedeb28",
      git_sha: "bedeb28fc28e346d25b031cd3b2b9685c67bde1f",
      hermes_ref: "29112be",
      notes: "Kernel-first shopping browser",
      artifact_base64: Buffer.from(new Uint8Array([0x1f, 0x8b, 0x08])).toString(
        "base64"
      ),
    });
  });

  it.each([
    ["bad version", { version: "bad version", git_sha: "bedeb28" }],
    ["bad git sha", { version: "2026.09.15-bedeb28", git_sha: "not-a-sha" }],
    [
      "bad Hermes ref",
      {
        version: "2026.09.15-bedeb28",
        git_sha: "bedeb28",
        hermes_ref: "not-a-sha",
      },
    ],
  ])("rejects %s before contacting the control plane", async (_label, fields) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await POST(request(fields));
    expect(response.status).toBe(303);
    expect(
      new URL(response.headers.get("location")!).searchParams.get("error")
    ).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects artifacts above the dashboard upload ceiling", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const artifact = new File(
      [new Uint8Array(3 * 1024 * 1024 + 1)],
      "template.tgz",
      { type: "application/gzip" }
    );
    const response = await POST(
      request(
        { version: "2026.09.15-bedeb28", git_sha: "bedeb28" },
        artifact
      )
    );
    expect(
      new URL(response.headers.get("location")!).searchParams.get("error")
    ).toBe("artifact must be a non-empty .tgz no larger than 3 MiB");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("surfaces the control-plane error without exposing its credential", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "release insert failed" }), {
        status: 500,
      })
    );
    const response = await POST(
      request({ version: "2026.09.15-bedeb28", git_sha: "bedeb28" })
    );
    expect(
      new URL(response.headers.get("location")!).searchParams.get("error")
    ).toBe("release insert failed");
    expect(response.headers.get("location")).not.toContain("test-admin-key");
  });
});
