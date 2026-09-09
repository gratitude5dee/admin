import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

import { POST } from "./route";

const eligibleBoxes = {
  window_days: 1,
  since: "2026-09-08T00:00:00.000Z",
  totals: {
    boxes: 1,
    by_state: { ready: 1 },
    starts: 0,
    stops: 0,
    box_seconds: 0,
  },
  users: [
    {
      user_id: "u1",
      provider_box_id: "bx_old",
      state: "ready",
      provider: "ascii",
      environment: "ubuntu",
      template_version: null,
      starts: 0,
      stops: 0,
      runs: 0,
      box_seconds: 0,
    },
  ],
};

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
    let postCall: {
      url: string;
      authorization: string | null;
      body: unknown;
    } | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (!init?.method) {
        return Response.json(eligibleBoxes);
      }
      postCall = {
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
    expect(postCall).toEqual({
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

  it("rejects a crafted request when control-plane metadata is ineligible", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        ...eligibleBoxes,
        users: [
          {
            ...eligibleBoxes.users[0],
            provider: null,
            environment: null,
          },
        ],
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

    expect(locationOf(response).searchParams.get("error")).toMatch(
      /Provider metadata/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a box that is not owned by the submitted user", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(eligibleBoxes));

    const response = await POST(
      request({
        user_id: "u1",
        box_id: "bx_other",
        provider: "tenki",
        confirm: "replace",
      }),
    );

    expect(locationOf(response).searchParams.get("error")).toBe(
      "current Box ownership could not be verified",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces a control-plane rejection to the operator", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json(eligibleBoxes))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: "box is already being replaced" }),
          {
            status: 409,
          },
        ),
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
