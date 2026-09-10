/**
 * Compute-migration types mirroring apps/web/lib/migration in airv2. The
 * control plane returns metadata only (phase, targets, intervals) — no file
 * contents or credentials cross the wire (C4).
 */
import "server-only";

export type MigrationDirection = "box_to_tenki" | "tenki_to_box";

export type MigrationPhase =
  | "preflight"
  | "preparing"
  | "precopy"
  | "waiting_for_idle"
  | "quiescing"
  | "final_copy"
  | "route_committed"
  | "activating"
  | "observing"
  | "cleanup_pending"
  | "completed"
  | "cancelled"
  | "failed"
  | "cleanup_failed"
  | "recovery_required"
  | "return_requested"
  | "returned";

export const TERMINAL_PHASES: ReadonlySet<MigrationPhase> = new Set([
  "completed",
  "cancelled",
  "failed",
  "returned",
]);

/** Post-commit phases where the candidate already owns the route. */
export const POST_COMMIT_PHASES: ReadonlySet<MigrationPhase> = new Set([
  "route_committed",
  "activating",
  "observing",
  "cleanup_pending",
]);

export interface MigrationListRow {
  id: string;
  user_id: string;
  direction: MigrationDirection;
  leg: "out" | "back";
  phase: MigrationPhase;
  wake_at: string | null;
  error_code: string | null;
  work_paused_at: string | null;
  work_resumed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MigrationTargetRow {
  role: "source" | "candidate" | "retained" | "active";
  provider: string;
  provider_box_id: string;
  hosted_url: string | null;
  credentials_sealed: string | null;
}

export interface MigrationDetail extends MigrationListRow {
  request_key: string | null;
  source_provider: string;
  target_provider: string;
  source_box_id: string;
  candidate_box_id: string | null;
  expected_generation: number;
  worker_lease_until: string | null;
  error_detail: string | null;
  cancel_requested_at: string | null;
  cleanup_approved_at: string | null;
  route_committed_at: string | null;
  activated_at: string | null;
  retention_until: string | null;
  completed_at: string | null;
  stats: Record<string, unknown> | null;
}

export interface MigrationStatus {
  migration: MigrationDetail | null;
  targets: MigrationTargetRow[];
  liveOperations: number;
  control: {
    admission: "open" | "closed";
    routing_generation: number;
    active_migration_id: string | null;
    fence_epoch: number;
  } | null;
}

export interface MigrationListResponse {
  migrations: MigrationListRow[];
}

/** Cancel is only safe before the route commit; after it, use return. */
export function cancellable(m: MigrationListRow): boolean {
  return (
    !TERMINAL_PHASES.has(m.phase) &&
    !POST_COMMIT_PHASES.has(m.phase) &&
    m.phase !== "return_requested" &&
    m.leg === "out"
  );
}

/** Return runs only on the outward leg after the route has committed. */
export function returnable(m: MigrationListRow): boolean {
  return m.leg === "out" && POST_COMMIT_PHASES.has(m.phase);
}

/** Cutover is meaningful once precopy has run (or is running). */
export function cutoverable(m: MigrationListRow): boolean {
  return m.phase === "precopy" || m.phase === "waiting_for_idle";
}

/** A parked or faulted migration an operator can re-arm. */
export function drivable(m: MigrationListRow): boolean {
  return (
    !TERMINAL_PHASES.has(m.phase) ||
    m.phase === "recovery_required" ||
    m.phase === "cleanup_failed"
  );
}

export function cleanupPending(m: MigrationListRow): boolean {
  return m.phase === "cleanup_pending";
}

export function directionLabel(direction: MigrationDirection): string {
  return direction === "box_to_tenki" ? "Box → Tenki" : "Tenki → Box";
}

export function phaseAccent(
  phase: MigrationPhase,
): "green" | "blue" | "orange" | "pink" | "none" {
  if (phase === "completed") return "green";
  if (phase === "failed" || phase === "cleanup_failed" || phase === "recovery_required")
    return "pink";
  if (phase === "waiting_for_idle" || phase === "quiescing" || phase === "final_copy")
    return "orange";
  if (TERMINAL_PHASES.has(phase)) return "none";
  return "blue";
}
