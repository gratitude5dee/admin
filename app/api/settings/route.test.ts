import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

import { POST } from "./route";

function request(fields: Record<string, string>): NextRequest {
  const form = new URLSearchParams(fields);
  return new NextRequest("https://admin.example.com/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

describe("POST /api/settings", () => {
  beforeEach(() => {
    process.env.CONTROL_PLANE_URL = "https://air.example.com";
    process.env.ADMIN_API_KEY = "test-admin-key";
  });
  afterEach(() => {
    delete process.env.CONTROL_PLANE_URL;
    delete process.env.ADMIN_API_KEY;
    vi.restoreAllMocks();
  });

  it("writes the provider setting upstream and redirects to /fleet", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            box_default_provider: "tenki",
            effective_box_provider: "tenki",
          })
        )
      );
    const response = await POST(request({ provider: "tenki" }));
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/fleet");
    expect(new URL(response.headers.get("location")!).search).toBe("");
    const [input, init] = fetchSpy.mock.calls[0]!;
    expect(String(input)).toBe(
      "https://air.example.com/api/admin/settings"
    );
    expect(init?.method).toBe("POST");
    expect(
      (init?.headers as Record<string, string>)["Authorization"]
    ).toBe("Bearer test-admin-key");
    expect(JSON.parse(String(init?.body))).toEqual({
      box_default_provider: "tenki",
    });
  });

  it.each(["", "morph", "TENKI"])(
    "rejects an unknown provider (%s) without touching the control plane",
    async (bad) => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const response = await POST(request({ provider: bad }));
      expect(response.status).toBe(303);
      const location = response.headers.get("location")!;
      expect(new URL(location).searchParams.get("error")).toContain(
        "unknown provider"
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  it("carries an upstream error back in the redirect", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "platform setting write failed" }), {
        status: 500,
      })
    );
    const response = await POST(request({ provider: "ascii" }));
    const location = response.headers.get("location")!;
    expect(new URL(location).searchParams.get("error")).toBe(
      "platform setting write failed"
    );
  });
});
