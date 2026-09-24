/** Response shapes of the airv2 control-plane admin endpoints (metadata only). */

export interface RelabelReport {
  relabeled: number;
  skipped: number;
  failed: number;
}

export interface StopIdleReport {
  channel: "dev" | "prod";
  targeted: number;
  processed: number;
  stopped: number;
  stopping: number;
  indexingDeferred: number;
  releaseFailed: number;
  continuation: { channel: "dev" | "prod"; after?: string } | null;
}

export interface UsersResponse {
  users: {
    user_id: string;
    username: string | null;
    status: string;
    created_at: string;
    handles: { platform: string; address: string }[];
  }[];
}

export interface TimeseriesPoint {
  ts: string;
  runs: number;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  box_seconds: number;
  starts: number;
  stops: number;
  /** Present only when /api/admin/timeseries is asked for the named series. */
  builds?: number;
  dev_releases?: number;
  publishes?: number;
}

/** Extra series /api/admin/timeseries?series= can carry (airv2 goal-create-v12 §12). */
export type TimeseriesSeries =
  | "tokens"
  | "cost"
  | "builds"
  | "dev_releases"
  | "publishes";

export interface TimeseriesResponse {
  window_days: number;
  since: string;
  bucket: "hour" | "day";
  user_id: string | null;
  points: TimeseriesPoint[];
}

export interface TokensResponse {
  window_days: number;
  since: string;
  totals: { prompt_tokens: number; completion_tokens: number; cost_usd: number };
  users: {
    user_id: string;
    runs: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost_usd: number;
  }[];
}

export interface ConnectorsResponse {
  statuses: string[];
  totals: {
    pending: number;
    active: number;
    revoked: number;
    error: number;
    unknown: number;
  };
  toolkits: {
    toolkit: string;
    pending: number;
    active: number;
    revoked: number;
    error: number;
    total: number;
    users: number;
  }[];
}

export interface BoxesResponse {
  window_days: number;
  since: string;
  totals: {
    boxes: number;
    by_state: Record<string, number>;
    starts: number;
    stops: number;
    box_seconds: number;
  };
  users: {
    user_id: string;
    username?: string | null;
    provider_box_id?: string | null;
    state: string | null;
    provider: string | null;
    environment?: string | null;
    /** Release channel the box follows (dev | prod). */
    channel?: string | null;
    /** Hermes ref pinned by the last include_hermes sync (was the template
     * release before the fleet ledger split it out into baseline_version). */
    template_version: string | null;
    /** Template release sync-box.sh last converged the box to. */
    baseline_version?: string | null;
    baseline_synced_at?: string | null;
    last_active_at?: string | null;
    starts: number;
    stops: number;
    runs: number;
    box_seconds: number;
  }[];
}

export interface HealthResponse {
  user_id: string;
  window_days: number;
  since: string;
  checked_at: string;
  memory: {
    enabled: boolean;
    status:
      | "not_checked"
      | "asleep"
      | "healthy"
      | "unhealthy"
      | "busy"
      | "unavailable";
    checked_at: string | null;
    woke: boolean;
    healthy: boolean;
    resources: number;
    memories: number | null;
    workspace_bytes: number;
    pending: number | null;
    truncated: boolean;
  };
  hermes: {
    runs: number;
    success: number;
    failed: number;
    other: number;
    open: number;
    stuck: number;
    last_run_at: string | null;
    last_success_at: string | null;
    last_failure_at: string | null;
    p95_latency_ms: number | null;
    failure_outcomes: Record<string, number>;
  };
  connectors: {
    total: number;
    counts: Record<string, number>;
    connections: {
      provider: string | null;
      toolkit: string | null;
      status: string;
      connected_at: string | null;
    }[];
  };
  transport: {
    total: number;
    received: number;
    dispatched: number;
    failed: number;
    ignored: number;
    queued: number;
    oldest_queued_at: string | null;
    oldest_queued_age_seconds: number | null;
    latest_received_at: string | null;
  };
  compute: {
    provider: string | null;
    provider_box_id: string | null;
    environment: string | null;
    state: string | null;
    channel: string;
    template_version: string | null;
    baseline_version: string | null;
    baseline_synced_at: string | null;
    target_version: string | null;
    target_hermes_ref: string | null;
    channel_updated_at: string | null;
    drift: "current" | "behind" | "hermes_behind" | "unsynced" | "no_target";
    last_active_at: string | null;
    stop_after: string | null;
    created_at: string | null;
    starts: number;
    stops: number;
    last_event_state: string | null;
    last_event_at: string | null;
    replacement_claimed_at: string | null;
    replacement_claim_status: "none" | "active" | "stale";
  };
  spend: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    gateway_cost_usd: number;
    speed_tier: string | null;
    spend_mtd_usd: number | null;
    monthly_cap_usd: number | null;
    monthly_cap_ratio: number | null;
    render_cents: number;
    storage_bytes: number;
    storage_cents_month: number;
    ad_spend_cents: number;
    ad_ceiling_cents: number | null;
    cortex_calls: number;
    cortex_errors: number;
  };
}

export interface OpsResponse {
  starts: {
    hour: number;
    day: number;
    hourly_ceiling: number;
    daily_ceiling: number;
    alerts: string[];
  };
  lines?: unknown[];
  [key: string]: unknown;
}

export interface CostsResponse {
  window_days?: number;
  users: {
    user_id: string;
    render_cents: number;
    storage_bytes: number;
    storage_cents_month: number;
    ad_spend_cents: number;
    ad_ceiling_cents: number | null;
  }[];
  [key: string]: unknown;
}

export interface TracesResponse {
  count: number;
  receipts: Record<string, string | number | null>[];
}

/** /api/admin/deliveries — the schedule_deliveries ledger: what each
 * claimed schedule tick sent or suppressed, and why. */
export interface DeliveriesResponse {
  days: number;
  deliveries: {
    id: string;
    user_id: string;
    schedule_id: string | null;
    schedule_name: string | null;
    channel: string;
    disposition: string;
    content_hash: string | null;
    excerpt: string | null;
    created_at: string;
  }[];
}

/** /api/admin/learning — the V10 learning plan plus content-free receipts. */
export interface LearningResponse {
  plan: {
    version: string;
    promotionPolicyVersion: string;
    objective: string;
    invariants: readonly string[];
    modes: readonly { mode: string; description: string }[];
    hardGates: readonly string[];
    softScoreDimensions: readonly string[];
    milestones: readonly {
      id: string;
      title: string;
      outcome: string;
      status: "shipped" | "in_progress" | "planned";
    }[];
    centralAllowlist: readonly string[];
    centralProhibitions: readonly string[];
  };
  modes: Record<string, number>;
  feedback: {
    total: number;
    last24h: number;
    forwarded: number;
    byReason: Record<string, number>;
  };
  experiments: {
    recent: {
      experiment_id: string;
      status: string;
      backend: string | null;
      os_class: string | null;
      sample_count: number | null;
      task_success_delta: number | null;
      task_success_delta_lower95: number | null;
      hard_gate_failures: number | null;
      tokens: number | null;
      cost_usd: number | null;
      latency_ms_p95: number | null;
      error_class: string | null;
      created_at: string;
      finished_at: string | null;
    }[];
    byStatus: Record<string, number>;
  };
  profiles: {
    profile_id: string;
    status: string;
    rollback_reason: string | null;
    activated_at: string | null;
    rolled_back_at: string | null;
    created_at: string;
  }[];
  events: {
    recent: {
      event_type: string;
      status: string | null;
      backend: string | null;
      error_class: string | null;
      rollback_reason: string | null;
      occurred_at: string;
    }[];
    byType: Record<string, number>;
  };
}

/** /api/admin/fleet/* — template releases, channel pointers, sync jobs. */
export interface FleetRelease {
  id: string;
  version: string;
  git_sha: string;
  hermes_ref: string | null;
  notes: string | null;
  created_at: string;
}

export interface FleetChannel {
  name: "dev" | "prod";
  release_id: string | null;
  template_box_id: string | null;
  updated_at: string;
}

export interface FleetSyncJob {
  id: string;
  channel: "dev" | "prod";
  release_id: string;
  state: "canary" | "rolling" | "paused" | "done" | "failed" | "aborted";
  include_hermes: boolean;
  wave_size: number;
  canary_box_ids: string[];
  failure_threshold: number;
  failures: number;
  created_at: string;
  updated_at: string;
}

export interface FleetSyncJobBox {
  job_id: string;
  provider_box_id: string;
  /** pending | syncing | ok | failed | deferred (busy box, retried next idle). */
  state: string;
  is_canary: boolean;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface FleetReleasesResponse {
  releases: FleetRelease[];
}

export interface FleetChannelsResponse {
  channels: FleetChannel[];
}

export interface FleetSyncResponse {
  jobs: FleetSyncJob[];
  latest_job_boxes: FleetSyncJobBox[];
}

export interface PlatformSettingsResponse {
  /** Stored platform_settings.box_default_provider ("ascii" when unset). */
  box_default_provider: string;
  /**
   * What provisioning actually uses — tenki only takes effect once the
   * control plane's TENKI_TEMPLATE_ID points at a snapshot ref.
   */
  effective_box_provider: string;
}

export interface OnboardingResponse {
  steps: string[];
  stale_after_ms: number;
  totals: {
    users: number;
    mirrored: number;
    cold: number;
    stale: number;
    completed: number;
    cards_sent: number;
  };
  funnel: Record<string, { done: number; skipped: number; todo: number }>;
  users: {
    user_id: string;
    username: string | null;
    created_at: string | null;
    done: number;
    skipped: number;
    todo: number;
    next_step: string | null;
    mirror_refreshed_at: string | null;
    card_sent_at: string | null;
  }[];
}

export interface FeedbackResponse {
  unavailable?: boolean;
  counts: Record<string, number>;
  items: {
    id: string;
    user_id: string;
    kind: string | null;
    title: string | null;
    body: string | null;
    status: string;
    created_at: string;
  }[];
}

/**
 * /api/admin/deployments — fleet channels plus every Create app's dev,
 * production and draft pointers (goal.md §5; airv2 goal-create-v12 §12).
 */
export interface DeploymentsResponse {
  control_plane: { git_sha: string | null; deployed_at: string | null; region: string | null };
  kit: { version: string; restricted_version: string | null };
  dispatcher: { healthy: boolean | null; checked_at: string | null };
  channels: FleetChannel[];
  apps: { total: number; dev_live: number; prod_live: number; drafts_only: number; expiring_7d: number };
  rows: {
    slug: string; username: string | null; appname: string | null;
    lane: "drop" | "vibe" | "import" | "push" | null;
    status: "draft" | "published" | "suspended"; visibility: "public" | "unlisted" | "private"; listed: boolean;
    dev_version: string | null; dev_expires_at: string | null;
    live_version: string | null; draft_version: string | null;
    last_build: { status: "queued" | "running" | "succeeded" | "failed"; finished_at: string | null; findings_hard: number } | null;
    qa_score: number | null; tests: { passed: number; total: number } | null;
    worker_sha256_prefix: string | null;
    functions_status: "disabled" | "draft" | "live" | "suspended";
    mirrored_at: string | null;
  }[];
}

/** /api/admin/create?days= — the Create intake funnel and build/QA health. */
export interface CreateOpsResponse {
  window_days: number;
  funnel: Record<
    | "asking" | "planning" | "plan_sent" | "revising" | "confirmed" | "building" | "qa" | "testing"
    | "dev_ready" | "finalizing" | "decision_sent" | "production" | "failed" | "abandoned", number>;
  medians_s: { first_question: number | null; plan: number | null; confirm_to_dev: number | null; dev_to_prod: number | null };
  builds: { total: number; failed: number; by_rule: Record<string, number> };
  qa: { p50: number | null; p90: number | null; below_70: number };
  tests: { declared: number; passed_ratio: number | null };
  progress_relay: { cards_updated: number; text_fallbacks: number; update_failures: number };
  mirror: { ok: number; failed: number };
  budget_exhausted: number;
  by_template: Record<string, number>;
}

/** /api/admin/tokens?group= — grouped spend; sums reconcile with `totals` (A6). */
export type TokensGroup = "user" | "model" | "family" | "provider" | "tier" | "lane" | "stage" | "project";
export interface TokensGroupedResponse extends TokensResponse {
  group: TokensGroup;
  groups: { key: string; runs: number; prompt_tokens: number; completion_tokens: number; total_tokens: number; cost_usd: number; cost_estimated: boolean }[];
}

/** V13 §12 `/api/admin/create/jobs?days=` — job ops for the /create page. */
export interface CreateJobFailure {
  id: string;
  app_id: string | null;
  state: string;
  step: string | null;
  rule: string | null;
  round: number | null;
  created_at: string | null;
}
export interface CreateJobsRollup {
  total: number;
  by_state: Record<string, number>;
  by_kind: Record<string, number>;
  dev_live: number;
  by_skill_ver: Record<string, number>;
  failures: CreateJobFailure[];
}
export interface CreateTokenGroup {
  key: string;
  runs: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  cost_estimated: boolean;
}
export interface CreateJobsResponse {
  window_days: number;
  jobs: CreateJobsRollup;
  token_usage: { by_stage: CreateTokenGroup[]; by_project: CreateTokenGroup[] };
  skill_use: { upgrades_queued: number; by_skill_ver: Record<string, number> };
}

/** V13 §12 `/api/admin/create/health` — is the Cloudflare lane ready. */
export interface CreateHealthResponse {
  ok: boolean;
  checks: Record<string, "ok" | "fail" | "skip">;
  reasons: string[];
  skill_version_min: number;
  max_fix_rounds: number;
  compile_max_per_turn: number;
  dev_origin_suffix: string;
}
