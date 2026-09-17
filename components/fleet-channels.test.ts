import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FleetChannel, FleetRelease, FleetSyncJob } from "@/lib/types";
import { channelAccent, FleetChannels, FleetChannelStats } from "./fleet-channels";

Object.assign(globalThis, { React });

const RELEASES: FleetRelease[] = [
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
const CHANNELS: FleetChannel[] = [
  { name: "dev", release_id: "rel-new", template_box_id: null, updated_at: "2026-09-15T01:00:00Z" },
  { name: "prod", release_id: "rel-old", template_box_id: null, updated_at: "2026-09-04T01:00:00Z" },
];

describe("channelAccent", () => {
  it("is green at latest, orange behind, blue with no releases", () => {
    expect(channelAccent(CHANNELS[0], RELEASES[0])).toBe("green");
    expect(channelAccent(CHANNELS[1], RELEASES[0])).toBe("orange");
    expect(channelAccent(CHANNELS[1], null)).toBe("blue");
  });
});

describe("FleetChannelStats", () => {
  it("renders one Stat per channel with the release version and accent", () => {
    const html = renderToStaticMarkup(
      createElement(FleetChannelStats, { channels: CHANNELS, releases: RELEASES })
    );
    expect(html).toContain("dev channel");
    expect(html).toContain("prod channel");
    expect(html).toContain("2026.09.15-bedeb28");
    expect(html).toContain("2026.09.04-ba5b7a5");
    expect(html).toContain("text-emerald-400");
    expect(html).toContain("text-orange-400");
    expect(html).not.toContain("<table");
  });

  it("shows a dash for a channel with no release and blue before any release is cut", () => {
    const html = renderToStaticMarkup(
      createElement(FleetChannelStats, {
        channels: [{ ...CHANNELS[1], release_id: null }],
        releases: [],
      })
    );
    expect(html).toContain("—");
    expect(html).toContain("text-sky-400");
  });
});

describe("FleetChannels", () => {
  const job: FleetSyncJob = {
    id: "j1", channel: "prod", release_id: "rel-old", state: "rolling", include_hermes: false,
    wave_size: 5, canary_box_ids: [], failure_threshold: 3, failures: 1,
    created_at: "2026-09-16T00:00:00Z", updated_at: "2026-09-16T00:00:00Z",
  };
  const boxes = [
    { provider_box_id: "bx_1", channel: "prod", baseline_version: "2026.09.04-ba5b7a5", template_version: null },
    { provider_box_id: "bx_2", channel: "prod", baseline_version: null, template_version: null },
  ];

  it("adds the per-channel table, drift counts, the active job and the manage link", () => {
    const html = renderToStaticMarkup(
      createElement(FleetChannels, { channels: CHANNELS, releases: RELEASES, boxes, jobs: [job] })
    );
    for (const header of ["channel", "release", "git sha", "hermes", "boxes", "drift", "active job", "updated"]) {
      expect(html).toContain(`>${header}</th>`);
    }
    expect(html).toContain("bedeb28");
    expect(html).toContain("29112be");
    expect(html).toContain("1 current");
    expect(html).toContain("1 unsynced");
    expect(html).toContain("rolling");
    expect(html).toContain("1 / 3 failures");
    expect(html).toContain('href="/fleet"');
    expect(html).toContain("manage → /fleet");
  });
});
