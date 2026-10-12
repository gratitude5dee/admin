import { getHostingTarget, type HostingTarget } from "@/lib/hostingSwitch";
import { LoadError, Panel, Stat, type StatAccent } from "@/components/panel";

export const dynamic = "force-dynamic";

const TARGET_ACCENT: Record<HostingTarget, StatAccent> = {
  vercel: "orange",
  cloudflare: "blue",
};

const TARGET_NOTE: Record<HostingTarget, string> = {
  vercel: "airv2.vercel.app origin — live once the Vercel account is paid",
  cloudflare:
    "airv2 Cloudflare Workers deployment — serves once the phase-2 port lands",
};

function SwitchButton({ target }: { target: HostingTarget }) {
  return (
    <form method="post" action="/api/hosting">
      <input type="hidden" name="target" value={target} />
      <button
        type="submit"
        className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] text-foreground hover:bg-muted"
      >
        Serve from {target === "vercel" ? "Vercel" : "Cloudflare"}
      </button>
    </form>
  );
}

export default async function HostingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  let target: HostingTarget | null = null;
  let loadError: string | null = null;
  try {
    target = await getHostingTarget();
  } catch (e) {
    loadError = e instanceof Error ? e.message : "unknown error";
  }

  return (
    <>
      {error ? <LoadError error={error} /> : null}
      {loadError ? <LoadError error={loadError} /> : null}
      <Panel
        title="Hosting — app.wzrd.tech"
        note="Which upstream the app-switch worker proxies app.wzrd.tech to. Flips instantly; no DNS changes."
      >
        <div className="flex items-end gap-6">
          <Stat
            label="Active upstream"
            value={target ?? "unreachable"}
            sub={target ? TARGET_NOTE[target] : undefined}
            accent={target ? TARGET_ACCENT[target] : "pink"}
          />
          <div className="flex gap-2 pb-1">
            <SwitchButton target="vercel" />
            <SwitchButton target="cloudflare" />
          </div>
        </div>
      </Panel>
      <Panel
        title="How it works"
        note="workers/app-switch proxies app.wzrd.tech/* to one of two upstreams, chosen by a KV flag this page flips"
      >
        <ul className="list-inside list-disc space-y-1 font-mono text-[11px] text-muted-foreground">
          <li>
            <span className="text-foreground">vercel</span> — proxy to the airv2
            project&apos;s canonical Vercel origin (returns 402 while the account
            is suspended)
          </li>
          <li>
            <span className="text-foreground">cloudflare</span> — proxy to the
            airv2 Workers deployment; used to cut over when phase 2 ships
          </li>
          <li>verify with response header x-served-by: app-switch:&lt;target&gt;</li>
        </ul>
      </Panel>
    </>
  );
}
