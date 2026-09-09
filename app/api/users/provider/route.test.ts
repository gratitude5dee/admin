import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

import { POST } from "./route";

function request(fields: Record<string, string>): NextRequest {
  const form = new URLSearchParams(fields);
  return new NextRequest("https://admin.example.com/api/users/provider", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

function locationOf(response: Response): URL {
  return new URL(response.headers.get("location")!);
}

describe("POST /api/users/provider", () => {
  beforeEach(() => {
    process.env.CONTROL_PLANE_URL = "https://air.example.com";
    process.env.ADMIN_API_KEY = "test-admin-key";
  });

  afterEach(() => {
    delete process.env.CONTROL_PLANE_URL;
    delete process.env.ADMIN_API_KEY;
    vi.restoreAllMocks();
  });

  it("requires the current user and box identifiers", async () => {
    const noUser = locationOf(await POST(request({})));
    expect(noUser.pathname).toBe("/users/unknown");
    expect(noUser.searchParams.get("error")).toBe("user_id required");

    const noBox = locationOf(await POST(request({ user_id: "u1" })));
    expect(noBox.pathname).toBe("/users/u1");
    expect(noBox.searchParams.get("error")).toBe("box_id required");
  });

  it("only accepts an explicit, confirmed Tenki switch", async () => {
    const wrongProvider = locationOf(
      await POST(
        request({ user_id: "u1", box_id: "bx_old", provider: "ascii" }),
      ),
    );
    expect(wrongProvider.searchParams.get("error")).toBe(
      "only an explicit Tenki switch is supported",
    );

    const unconfirmed = locationOf(
      await POST(
        request({ user_id: "u1", box_id: "bx_old", provider: "tenki" }),
      ),
    );
    expect(unconfirmed.searchParams.get("error")).toBe(
      "confirm the Box replacement first",
    );
  });

  it("sends the switch through the server-side admin client", async () => {
    let call: { url: string; authorization: string | null; body: unknown } | null =
      null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      call = {
        url: String(input),
        authorization: new Headers(init?.headers).get("authorization"),
        body: JSON.parse(String(init?.body)),
      };
      return new Response(
        JSON.stringify({
          user_id: "u1",
          previous_box_id: "bx_old",
          box_id: "tk_new",
          provider: "tenki",
        }),
      );
    });

    const response = await POST(
      request({
        user_id: "u1",
        box_id: "bx_old",
        provider: "tenki",
        confirm: "replace",
        days: "30",
      }),
    );
    expect(response.status).toBe(303);
    expect(call).toEqual({
      url: "https://air.example.com/api/admin/boxes/reprovision",
      authorization: "Bearer test-admin-key",
      body: {
        user_id: "u1",
        box_id: "bx_old",
        provider: "tenki",
      },
    });
    const location = locationOf(response);
    expect(location.pathname).toBe("/users/u1");
    expect(location.searchParams.get("days")).toBe("30");
    expect(location.searchParams.get("switched")).toBe("tenki");
  });

  it("surfaces a control-plane rejection to the operator", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "box is already being replaced" }), {
        status: 409,
      }),
    );
    const response = await POST(
      request({
        user_id: "u1",
        box_id: "bx_old",
        provider: "tenki",
        confirm: "replace",
      }),
    );
    expect(locationOf(response).searchParams.get("error")).toBe(
      "box is already being replaced",
    );
  });
});
