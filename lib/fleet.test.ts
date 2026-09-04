import { describe, expect, it } from "vitest";
import {
  CLAIM_LEASE_MS,
  boxDrift,
  claimAge,
  countBy,
  formatDuration,
  rowDuration,
  shortRef,
} from "./fleet";

const RELEASE = {
  id: "rel-1",
  version: "2026.09.04-ba5b7a5",
  git_sha: "ba5b7a588ca91fd0197c76501dc457e71a966d08",
  hermes_ref: "29112bef099274229cadff79cdff7bf7b99c4b77",
  notes: null,
  created_at: "2026-09-04T18:30:00Z",
};

describe("boxDrift", () => {
  it("is current when release and hermes ref both match", () => {
    expect(
      boxDrift(
        {
          baseline_version: RELEASE.version,
          template_version: RELEASE.hermes_ref,
        },
        RELEASE
      )
    ).toBe("current");
  });

  it("flags an older baseline as behind", () => {
    expect(
      boxDrift(
        {
          baseline_version: "2026.08.28-3956abf",
          template_version: RELEASE.hermes_ref,
        },
        RELEASE
      )
    ).toBe("behind");
  });

  it("flags a matching baseline with a stale hermes pin", () => {
    expect(
      boxDrift(
        { baseline_version: RELEASE.version, template_version: "fcbd1076" },
        RELEASE
      )
    ).toBe("hermes behind");
  });

  it("ignores the hermes pin when the release does not pin one", () => {
    expect(
      boxDrift(
        { baseline_version: RELEASE.version, template_version: "anything" },
        { ...RELEASE, hermes_ref: null }
      )
    ).toBe("current");
  });

  it("reports unsynced boxes and missing targets", () => {
    expect(
      boxDrift({ baseline_version: null, template_version: "x" }, RELEASE)
    ).toBe("unsynced");
    expect(
      boxDrift({ baseline_version: RELEASE.version, template_version: "x" }, null)
    ).toBe("no target");
  });
});

describe("claimAge", () => {
  const now = Date.parse("2026-09-04T20:00:00Z");

  it("only reports syncing rows with a start time", () => {
    expect(claimAge({ state: "pending", started_at: null }, now)).toBeNull();
    expect(
      claimAge({ state: "ok", started_at: "2026-09-04T19:50:00Z" }, now)
    ).toBeNull();
    expect(claimAge({ state: "syncing", started_at: null }, now)).toBeNull();
  });

  it("does not call a claim stale before the lease runs out", () => {
    const started = new Date(now - CLAIM_LEASE_MS + 60_000).toISOString();
    expect(claimAge({ state: "syncing", started_at: started }, now)).toEqual({
      label: "23m 20s ago",
      expired: false,
    });
  });

  it("marks a claim expired once it outlives the lease", () => {
    const started = new Date(now - CLAIM_LEASE_MS - 1000).toISOString();
    expect(claimAge({ state: "syncing", started_at: started }, now)).toEqual({
      label: "24m 21s ago",
      expired: true,
    });
  });
});

describe("formatting", () => {
  it("formats durations", () => {
    expect(formatDuration(4_000)).toBe("4s");
    expect(formatDuration(95_000)).toBe("1m 35s");
    expect(formatDuration(3_660_000)).toBe("1h 1m");
  });

  it("shortens 40-char shas only", () => {
    expect(shortRef(RELEASE.hermes_ref)).toBe("29112be");
    expect(shortRef("2026.09.04-ba5b7a5")).toBe("2026.09.04-ba5b7a5");
    expect(shortRef(null)).toBeNull();
  });

  it("computes a row's wall clock", () => {
    expect(
      rowDuration({
        started_at: "2026-09-04T19:00:00Z",
        finished_at: "2026-09-04T19:02:30Z",
      })
    ).toBe("2m 30s");
    expect(rowDuration({ started_at: null, finished_at: null })).toBeNull();
  });

  it("counts by key", () => {
    expect(
      countBy(
        [{ state: "ok" }, { state: "ok" }, { state: "deferred" }],
        (r) => r.state
      )
    ).toEqual({ ok: 2, deferred: 1 });
  });
});
