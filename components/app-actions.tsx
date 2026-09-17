"use client";

/**
 * Per-app operator actions (goal.md §3.1, A3): revoke dev / renew dev /
 * suspend. Each is a two-step — the first click only reveals an inline
 * confirm form, and that form is a plain same-origin POST to
 * /api/deployments/apps/[slug]/{dev,suspend}, which proxies to the control
 * plane with the bearer and 303s back to /deployments. Nothing is fetched
 * from the browser and nothing renders optimistically: after the redirect the
 * row shows whatever the control plane reports.
 */
import { useState } from "react";
import { actionRoute, APP_ACTIONS, type AppAction } from "@/lib/deployments";

const button =
  "rounded-md border border-border bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";

function labelOf(action: AppAction): string {
  return APP_ACTIONS.find((entry) => entry.action === action)?.label ?? action;
}

export function AppActions({
  slug,
  hasDev,
  suspended,
}: {
  slug: string;
  /** Revoke and renew need a dev release to act on (the control plane 409s a renew without one). */
  hasDev: boolean;
  suspended: boolean;
}) {
  const [pending, setPending] = useState<AppAction | null>(null);

  if (pending !== null) {
    const { path, fields } = actionRoute(slug, pending);
    return (
      <form method="post" action={path} className="flex items-center gap-2">
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <span className="font-mono text-[10px] text-muted-foreground">
          {labelOf(pending)} {slug}?
        </span>
        <button
          type="submit"
          className={`${button} text-pink-400 hover:text-pink-300`}
        >
          confirm
        </button>
        <button type="button" onClick={() => setPending(null)} className={button}>
          cancel
        </button>
      </form>
    );
  }

  return (
    <div className="flex gap-1">
      {APP_ACTIONS.map(({ action, label }) => {
        const disabled = action === "suspend" ? suspended : !hasDev;
        return (
          <button
            key={action}
            type="button"
            disabled={disabled}
            onClick={() => setPending(action)}
            title={
              disabled
                ? action === "suspend"
                  ? "already suspended"
                  : "no dev release"
                : undefined
            }
            className={button}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
