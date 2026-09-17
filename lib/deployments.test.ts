import { describe, expect, it } from "vitest";
import type { FleetChannel, FleetRelease, FleetSyncJob } from "./types";
import {
  actionRoute,
  ago,
  appUrl,
  buildAccent,
  DAY_MS,
  devExpiry,
  functionsAccent,
  HOUR_MS,
  isAppSlug,
  jobStateAccent,
  qaAccent,
  reconcileCounts,
  statusAccent,
  stripContentFields,
  summarizeChannels,
  testsAccent,
} from "./deployments";

const NOW = Date.parse("2026-09-17T12:00:00Z");
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe("devExpiry", () => {
  it("reports nothing when there is no expiry", () => {
    expect(devExpiry(null, NOW)).toEqual({ label: "—", accent: "none" });
    expect(devExpiry("not a date", NOW)).toEqual({ label: "—", accent: "none" });
  });

  it("is pink once expired, including at the exact instant", () => {
    expect(devExpiry(at(-HOUR_MS), NOW)).toEqual({ label: "expired", accent: "pink" });
    expect(devExpiry(at(0), NOW)).toEqual({ label: "expired", accent: "pink" });
  });

  it("counts hours and reads orange inside the last day (0 days)", () => {
    expect(devExpiry(at(10 * HOUR_MS), NOW)).toEqual({
      label: "expires in 10h",
      accent: "orange",
    });
    expect(devExpiry(at(90_000), NOW)).toEqual({
      label: "expires in 1h",
      accent: "orange",
    });
  });

  it("is orange at 2 days", () => {
    expect(devExpiry(at(2 * DAY_MS + 5 * HOUR_MS), NOW)).toEqual({
      label: "expires in 2d",
      accent: "orange",
    });
  });

  it("stops being orange at exactly 3 days", () => {
    expect(devExpiry(at(3 * DAY_MS), NOW)).toEqual({
      label: "expires in 3d",
      accent: "green",
    });
    expect(devExpiry(at(3 * DAY_MS - 1), NOW).accent).toBe("orange");
  });

  it("is green at 13 days (a fresh CREATE_DEV_TTL release)", () => {
    expect(devExpiry(at(13 * DAY_MS + HOUR_MS), NOW)).toEqual({
      label: "expires in 13d",
      accent: "green",
    });
  });
});

describe("accents", () => {
  it("colors builds by outcome, in-flight blue", () => {
    expect(buildAccent("succeeded")).toBe("green");
    expect(buildAccent("failed")).toBe("pink");
    expect(buildAccent("running")).toBe("blue");
    expect(buildAccent("queued")).toBe("blue");
    expect(buildAccent(null)).toBe("none");
  });

  it("flags any test shortfall pink", () => {
    expect(testsAccent(4, 4)).toBe("green");
    expect(testsAccent(1, 3)).toBe("pink");
    expect(testsAccent(5, 3)).toBe("pink");
    expect(testsAccent(0, 0)).toBe("none");
  });

  it("flags QA under 70", () => {
    expect(qaAccent(88)).toBe("green");
    expect(qaAccent(70)).toBe("green");
    expect(qaAccent(61)).toBe("pink");
    expect(qaAccent(null)).toBe("none");
  });

  it("colors app status, Functions state and sync job state", () => {
    expect(statusAccent("published")).toBe("green");
    expect(statusAccent("draft")).toBe("blue");
    expect(statusAccent("suspended")).toBe("pink");
    expect(functionsAccent("live")).toBe("green");
    expect(functionsAccent("draft")).toBe("blue");
    expect(functionsAccent("suspended")).toBe("pink");
    expect(functionsAccent("disabled")).toBe("none");
    expect(jobStateAccent("done")).toBe("green");
    expect(jobStateAccent("failed")).toBe("pink");
    expect(jobStateAccent("aborted")).toBe("pink");
    expect(jobStateAccent("paused")).toBe("orange");
    expect(jobStateAccent("rolling")).toBe("blue");
    expect(jobStateAccent("canary")).toBe("blue");
  });
});

describe("appUrl", () => {
  it("builds link and mini URLs from valid parts", () => {
    expect(appUrl("link.wzrd.tech", "alice", "tour")).toBe(
      "https://link.wzrd.tech/alice/tour"
    );
    expect(appUrl("mini.wzrd.tech", "al_ice", "my-tour-2")).toBe(
      "https://mini.wzrd.tech/al_ice/my-tour-2"
    );
  });

  it("rejects a hyphenated username (USERNAME_PATTERN allows [a-z0-9_] only)", () => {
    expect(appUrl("link.wzrd.tech", "ali-ce", "tour")).toBeNull();
  });

  it("rejects every other shape the control plane would refuse", () => {
    expect(appUrl("link.wzrd.tech", "Alice", "tour")).toBeNull();
    expect(appUrl("link.wzrd.tech", "a", "tour")).toBeNull();
    expect(appUrl("link.wzrd.tech", "a".repeat(25), "tour")).toBeNull();
    expect(appUrl("link.wzrd.tech", "alice", "-tour")).toBeNull();
    expect(appUrl("link.wzrd.tech", "alice", "tour-")).toBeNull();
    expect(appUrl("link.wzrd.tech", "alice", "a".repeat(33))).toBeNull();
    expect(appUrl("link.wzrd.tech", "../etc", "tour")).toBeNull();
    expect(appUrl("link.wzrd.tech", "alice", "tour/../x")).toBeNull();
    expect(appUrl("link.wzrd.tech", null, "tour")).toBeNull();
    expect(appUrl("link.wzrd.tech", "alice", null)).toBeNull();
    expect(appUrl("link.wzrd.tech", "", "")).toBeNull();
  });
});

describe("isAppSlug", () => {
  it("accepts the §4 slug grammar and nothing else", () => {
    expect(isAppSlug("alice-tour")).toBe(true);
    expect(isAppSlug("bob_notes")).toBe(true);
    expect(isAppSlug("a")).toBe(true);
    expect(isAppSlug("a".repeat(64))).toBe(true);
    expect(isAppSlug("a".repeat(65))).toBe(false);
    expect(isAppSlug("-bad")).toBe(false);
    expect(isAppSlug("_bad")).toBe(false);
    expect(isAppSlug("Alice")).toBe(false);
    expect(isAppSlug("a/b")).toBe(false);
    expect(isAppSlug("a b")).toBe(false);
    expect(isAppSlug("")).toBe(false);
  });
});

describe("ago", () => {
  it("formats past and future timestamps relative to now", () => {
    expect(ago(at(-3 * HOUR_MS), NOW)).toBe("3h 0m ago");
    expect(ago(at(-40 * 60_000), NOW)).toBe("40m 0s ago");
    expect(ago(at(2 * 60_000), NOW)).toBe("in 2m 0s");
    expect(ago(null, NOW)).toBeNull();
    expect(ago("garbage", NOW)).toBeNull();
  });
});

describe("stripContentFields (A1)", () => {
  it("drops content-bearing keys and keeps metadata", () => {
    const row = {
      slug: "alice-tour",
      qa_score: 88,
      prompt: "should never render",
      plan: { steps: [] },
      source: "export default 1",
      body: "hello",
      message: "hi",
    };
    const stripped = stripContentFields(row);
    expect(stripped).toEqual({ slug: "alice-tour", qa_score: 88 });
    expect(Object.keys(stripped)).not.toContain("prompt");
    // The input is left alone.
    expect(row.prompt).toBe("should never render");
  });
});

describe("reconcileCounts (A6)", () => {
  const apps = { total: 2, dev_live: 1, prod_live: 1, drafts_only: 1, expiring_7d: 1 };
  const funnel = {
    asking: 3, planning: 2, plan_sent: 2, revising: 1, confirmed: 2, building: 1, qa: 1, testing: 1,
    dev_ready: 1, finalizing: 1, decision_sent: 1, production: 1, failed: 1, abandoned: 2,
  };

  it("matches when production apps equal the funnel's production count", () => {
    expect(reconcileCounts({ apps }, { funnel })).toEqual({
      prod_live: 1,
      production: 1,
      matches: true,
    });
  });

  it("reports the mismatch otherwise", () => {
    expect(
      reconcileCounts({ apps: { ...apps, prod_live: 2 } }, { funnel })
    ).toEqual({ prod_live: 2, production: 1, matches: false });
  });
});

describe("summarizeChannels", () => {
  const releases: FleetRelease[] = [
    {
      id: "rel-new",
      version: "2026.09.15-bedeb28",
      git_sha: "bedeb28ca91fd0197c76501dc457e71a966d08ba",
      hermes_ref: "29112bef099274229cadff79cdff7bf7b99c4b77",
      notes: null,
      created_at: "2026-09-15T00:00:00Z",
    },
    {
      id: "rel-old",
      version: "2026.09.04-ba5b7a5",
      git_sha: "ba5b7a588ca91fd0197c76501dc457e71a966d08",
      hermes_ref: null,
      notes: null,
      created_at: "2026-09-04T00:00:00Z",
    },
  ];
  const channels: FleetChannel[] = [
    { name: "dev", release_id: "rel-new", template_box_id: null, updated_at: "2026-09-15T01:00:00Z" },
    { name: "prod", release_id: "rel-old", template_box_id: null, updated_at: "2026-09-04T01:00:00Z" },
  ];
  const boxes = [
    { provider_box_id: "bx_1", channel: "prod", baseline_version: "2026.09.04-ba5b7a5", template_version: null },
    { provider_box_id: "bx_2", channel: null, baseline_version: "2026.08.28-3956abf", template_version: null },
    { provider_box_id: "bx_3", channel: "dev", baseline_version: "2026.09.15-bedeb28", template_version: "29112bef099274229cadff79cdff7bf7b99c4b77" },
    { provider_box_id: null, channel: "dev", baseline_version: null, template_version: null },
  ];
  const job = (channel: "dev" | "prod", state: FleetSyncJob["state"], id: string): FleetSyncJob => ({
    id, channel, release_id: "rel-old", state, include_hermes: false, wave_size: 5,
    canary_box_ids: [], failure_threshold: 3, failures: 0,
    created_at: "2026-09-16T00:00:00Z", updated_at: "2026-09-16T00:00:00Z",
  });

  it("counts boxes per channel (unset channel follows prod) with their drift", () => {
    const [dev, prod] = summarizeChannels(channels, releases, boxes, []);
    expect(dev.release?.version).toBe("2026.09.15-bedeb28");
    expect(dev.boxes).toBe(1);
    expect(dev.drift).toEqual({ current: 1 });
    expect(prod.boxes).toBe(2);
    expect(prod.drift).toEqual({ current: 1, behind: 1 });
  });

  it("picks the newest active job on the channel and ignores finished ones", () => {
    const jobs = [job("prod", "done", "j3"), job("prod", "rolling", "j2"), job("dev", "aborted", "j1")];
    const [dev, prod] = summarizeChannels(channels, releases, boxes, jobs);
    expect(prod.job?.id).toBe("j2");
    expect(dev.job).toBeNull();
  });

  it("reports no target when the channel points at an unknown or missing release", () => {
    const [dev, prod] = summarizeChannels(
      [
        { ...channels[0], release_id: "rel-gone" },
        { ...channels[1], release_id: null },
      ],
      releases,
      boxes,
      []
    );
    expect(dev.release).toBeNull();
    expect(dev.drift).toEqual({ "no target": 1 });
    expect(prod.drift).toEqual({ "no target": 2 });
  });
});

describe("actionRoute", () => {
  it("maps revoke/renew to the dev route with an action field", () => {
    expect(actionRoute("alice-tour", "revoke")).toEqual({
      path: "/api/deployments/apps/alice-tour/dev",
      fields: { action: "revoke" },
    });
    expect(actionRoute("alice-tour", "renew").fields).toEqual({ action: "renew" });
  });

  it("maps suspend to the suspend route with no fields", () => {
    expect(actionRoute("bob-notes", "suspend")).toEqual({
      path: "/api/deployments/apps/bob-notes/suspend",
      fields: {},
    });
  });

  it("encodes a slug it cannot trust", () => {
    expect(actionRoute("a/b", "suspend").path).toBe(
      "/api/deployments/apps/a%2Fb/suspend"
    );
  });
});
