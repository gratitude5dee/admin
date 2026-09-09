import type { BoxesResponse } from "@/lib/types";

export type ProviderSwitchBox = BoxesResponse["users"][number];

const SWITCHABLE_BOX_STATES = new Set(["ready", "idle", "stopped"]);

export function tenkiSwitchEligibility(
  box: ProviderSwitchBox | undefined,
): { eligible: boolean; message: string | null } {
  if (!box) {
    return {
      eligible: false,
      message: "This user has no compute to switch.",
    };
  }
  if (!box.provider) {
    return {
      eligible: false,
      message: "Provider metadata is unavailable; replacement is disabled.",
    };
  }
  if (box.provider === "tenki") {
    return {
      eligible: false,
      message: "This user is already on Tenki.",
    };
  }
  if (box.provider !== "ascii") {
    return {
      eligible: false,
      message: `Provider ${box.provider} is not eligible for a Tenki replacement.`,
    };
  }
  if (!box.environment) {
    return {
      eligible: false,
      message: "Environment metadata is unavailable; replacement is disabled.",
    };
  }
  if (box.environment !== "ubuntu") {
    return {
      eligible: false,
      message: "Tenki currently supports Ubuntu users only.",
    };
  }
  if (!box.provider_box_id) {
    return {
      eligible: false,
      message: "Provider Box metadata is unavailable; replacement is disabled.",
    };
  }
  if (!SWITCHABLE_BOX_STATES.has(box.state ?? "")) {
    return {
      eligible: false,
      message:
        "Wait until the current Box is ready, idle, or stopped before switching.",
    };
  }
  return { eligible: true, message: null };
}
