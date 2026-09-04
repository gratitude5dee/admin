/** Response shapes of the airv2 control-plane admin endpoints (metadata only). */

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
}

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
