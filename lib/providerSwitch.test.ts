import { describe, expect, it } from "vitest";
import type { ProviderSwitchBox } from "./providerSwitch";
import { tenkiSwitchEligibility } from "./providerSwitch";

function box(
  overrides: Partial<ProviderSwitchBox> = {},
): ProviderSwitchBox {
  return {
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
    ...overrides,
  };
}

describe("tenkiSwitchEligibility", () => {
  it("requires explicit provider and environment metadata", () => {
    expect(tenkiSwitchEligibility(box({ provider: null })).message).toMatch(
      /Provider metadata/,
    );
    expect(
      tenkiSwitchEligibility(box({ environment: null })).message,
    ).toMatch(/Environment metadata/);
  });

  it("reports unsupported providers before state guidance", () => {
    expect(
      tenkiSwitchEligibility(box({ provider: "namespace", state: "busy" }))
        .message,
    ).toBe("Provider namespace is not eligible for a Tenki replacement.");
  });

  it("permits only ready, idle, or stopped ascii Ubuntu boxes", () => {
    expect(tenkiSwitchEligibility(box())).toEqual({
      eligible: true,
      message: null,
    });
    expect(tenkiSwitchEligibility(box({ state: "starting" })).eligible).toBe(
      false,
    );
  });
});
