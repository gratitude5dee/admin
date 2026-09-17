/**
 * Same-origin check for state-changing requests (CSRF). The session cookie is
 * SameSite=Lax, which stops cross-site posts but not a form on a sibling host
 * of the same site (link.wzrd.tech, mini.wzrd.tech host owner apps). Browsers
 * always send `Origin` on a POST, so a mutating request whose Origin is missing
 * or whose host is not this dashboard's host is refused before any route runs.
 * Edge-safe: no Node APIs.
 */
export const MUTATING_METHODS: ReadonlySet<string> = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

export function needsOriginCheck(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase());
}

/** True when `origin` names exactly `host` (scheme ignored; the host is what the cookie binds to). */
export function originMatchesHost(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}
