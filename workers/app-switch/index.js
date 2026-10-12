/**
 * app-switch — traffic director for app.wzrd.tech.
 *
 * Every request is proxied to one of two upstreams chosen by the `target` key
 * in the HOSTING KV namespace (default "vercel"):
 *
 *   vercel      → UPSTREAM_VERCEL (the airv2 project's canonical vercel.app
 *                 origin, which keeps working after app.wzrd.tech DNS points
 *                 at this worker)
 *   cloudflare  → UPSTREAM_CF (the airv2 Workers deployment once phase 2 lands)
 *
 * The flag is flipped through `/_switch`, a bearer-authed endpoint the admin
 * dashboard calls server-side:
 *
 *   GET  /_switch                → {"target": "vercel" | "cloudflare"}
 *   POST /_switch  {target}      → flips the flag
 *
 * All other paths proxy through. Responses carry `x-served-by: app-switch:<t>`
 * so the active lane is easy to verify.
 */

const SWITCH_PATH = "/_switch";
const TARGETS = new Set(["vercel", "cloudflare"]);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function currentTarget(env) {
  const t = await env.HOSTING.get("target");
  return TARGETS.has(t) ? t : "vercel";
}

async function handleSwitch(request, env) {
  const auth = request.headers.get("authorization") || "";
  if (!env.SWITCH_TOKEN || auth !== `Bearer ${env.SWITCH_TOKEN}`) {
    return json({ error: "unauthorized" }, 401);
  }
  if (request.method === "GET") {
    return json({ target: await currentTarget(env) });
  }
  if (request.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json body" }, 400);
  }
  const target = String(body?.target ?? "").toLowerCase();
  if (!TARGETS.has(target)) {
    return json(
      { error: `target must be one of: ${[...TARGETS].join(", ")}` },
      400,
    );
  }
  await env.HOSTING.put("target", target);
  return json({ target });
}

// Headers that must not be forwarded to the upstream or back to the client.
const DROP_REQUEST = new Set([
  "host",
  "connection",
  "cdn-loop",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-worker",
  "cf-request-id",
  "x-forwarded-for",
]);

async function proxy(request, env) {
  const target = await currentTarget(env);
  const upstream = new URL(
    target === "cloudflare" ? env.UPSTREAM_CF : env.UPSTREAM_VERCEL,
  );
  const url = new URL(request.url);
  const dest = new URL(url.pathname + url.search, upstream);

  const headers = new Headers(request.headers);
  for (const h of DROP_REQUEST) headers.delete(h);
  headers.set("host", upstream.host);
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));
  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp) headers.set("x-forwarded-for", clientIp);

  let upstreamResp;
  try {
    upstreamResp = await fetch(
      new Request(dest, {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method) ? null : request.body,
        redirect: "manual",
      }),
    );
  } catch (err) {
    return json(
      { error: `upstream ${target} unreachable`, detail: String(err) },
      502,
    );
  }

  const out = new Headers(upstreamResp.headers);
  const location = out.get("location");
  if (location) {
    try {
      const l = new URL(location, dest);
      if (l.host === upstream.host) {
        l.host = url.host;
        out.set("location", l.toString());
      }
    } catch {
      /* leave Location untouched */
    }
  }
  out.set("x-served-by", `app-switch:${target}`);
  return new Response(upstreamResp.body, {
    status: upstreamResp.status,
    statusText: upstreamResp.statusText,
    headers: out,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === SWITCH_PATH) return handleSwitch(request, env);
    return proxy(request, env);
  },
};
