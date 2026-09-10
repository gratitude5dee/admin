import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

function request(fields: Record<string, string>): NextRequest {
  return new NextRequest("https://admin.example.com/api/fleet/boxes", {
    method: "POST",
    body: new URLSearchParams(fields),
  });
}

function location(response: Response): URL {
  return new URL(response.headers.get("location")!);
}

describe("fleet box actions", () => {
  beforeEach(() => {
    vi.stubEnv("CONTROL_PLANE_URL", "https://air.example.com");
    vi.stubEnv("ADMIN_API_KEY", "test-admin-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("applies labels with server-side authentication and reports partial failure", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ relabeled: 2, skipped: 1, failed: 1 }),
    );
    const response = await POST(request({ action: "relabel" }));
    expect(response.status).toBe(303);
    expect(fetch).toHaveBeenCalledWith("https://air.example.com/api/admin/boxes/relabel", expect.objectContaining({
      method: "POST",
      headers: { Authorization: "Bearer test-admin-key", "Content-Type": "application/json" },
      body: "{}",
    }));
    expect(location(response).searchParams.get("box_result")).toContain("2 applied, 1 skipped, 1 failed");
    expect(response.headers.get("location")).not.toContain("test-admin-key");
  });

  it.each<Record<string, string>>([
    { action: "force-stop", channel: "prod", confirm: "stop-idle" },
    { action: "stop-idle", channel: "all", confirm: "stop-idle" },
    { action: "stop-idle", channel: "prod" },
    { action: "stop-idle", channel: "dev", confirm: "stop-idle", after: " " },
  ])("rejects invalid or unconfirmed mutations: %j", async (fields) => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const response = await POST(request(fields));
    expect(location(response).searchParams.has("error")).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("defaults to dev and preserves the remaining cursor without looping", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      channel: "dev", targeted: 8, processed: 5, stopped: 1, stopping: 1,
      indexingDeferred: 2, releaseFailed: 1,
      continuation: { channel: "dev", after: "tk_next" },
    }));
    const response = await POST(request({ action: "stop-idle", confirm: "stop-idle", after: "bx_previous" }));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]?.body).toBe('{"channel":"dev","after":"bx_previous"}');
    const url = location(response);
    expect(url.searchParams.get("continue_stop")).toBe("dev");
    expect(url.searchParams.get("after")).toBe("tk_next");
    expect(url.searchParams.get("box_result")).toContain("1 stop errors, 1 claim release errors");
  });

  it("requires another explicit request when the budget expires before any claim", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      channel: "prod", targeted: 8, processed: 0, stopped: 0, stopping: 0,
      indexingDeferred: 0, releaseFailed: 0, continuation: { channel: "prod" },
    }));
    const url = location(await POST(request({ action: "stop-idle", channel: "prod", confirm: "stop-idle" })));
    expect(url.searchParams.get("continue_stop")).toBe("prod");
    expect(url.searchParams.has("after")).toBe(false);
  });

  it("does not offer continuation after the last batch", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({
      channel: "prod", targeted: 0, processed: 0, stopped: 0, stopping: 0,
      indexingDeferred: 0, releaseFailed: 0, continuation: null,
    }));
    const url = location(await POST(request({ action: "stop-idle", channel: "prod", confirm: "stop-idle", after: "bx_last" })));
    expect(url.searchParams.has("continue_stop")).toBe(false);
    expect(url.searchParams.has("after")).toBe(false);
  });

  it("shows control-plane failures instead of claiming success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ error: "route not deployed" }, { status: 404 }),
    );
    const url = location(await POST(request({ action: "relabel" })));
    expect(url.searchParams.get("error")).toContain("route not deployed");
    expect(url.searchParams.has("box_result")).toBe(false);
  });

  it("preserves the confirmed continuation after a control-plane failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ error: "temporarily unavailable" }, { status: 503 }),
    );
    const url = location(await POST(request({
      action: "stop-idle", channel: "prod", confirm: "stop-idle", after: "bx_previous",
    })));
    expect(url.searchParams.get("error")).toContain("temporarily unavailable");
    expect(url.searchParams.get("continue_stop")).toBe("prod");
    expect(url.searchParams.get("after")).toBe("bx_previous");
    expect(url.searchParams.has("box_result")).toBe(false);
  });
});
