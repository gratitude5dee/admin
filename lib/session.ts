/**
 * Signed httpOnly session cookie for the dashboard password gate. Web
 * Crypto only, so the same code verifies in the edge middleware and signs
 * in the nodejs login route. The cookie value is `<expiresMs>.<hmacHex>`
 * where the HMAC-SHA256 key is SESSION_SECRET (DASHBOARD_PASSWORD is the
 * fallback key so a single env var is enough to boot).
 */

export const SESSION_COOKIE = "wzrd_admin_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function secret(): string | null {
  return (
    process.env.SESSION_SECRET ?? process.env.DASHBOARD_PASSWORD ?? null
  );
}

async function hmacHex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(message)
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSessionCookie(
  now = Date.now()
): Promise<string | null> {
  const key = secret();
  if (!key) return null;
  const expires = now + SESSION_TTL_MS;
  return `${expires}.${await hmacHex(key, `session:${expires}`)}`;
}

export async function verifySessionCookie(
  value: string | undefined,
  now = Date.now()
): Promise<boolean> {
  const key = secret();
  if (!key || !value) return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const expiresPart = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  const expires = Number(expiresPart);
  if (!Number.isFinite(expires) || expires <= now) return false;
  const expected = await hmacHex(key, `session:${expiresPart}`);
  if (signature.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/** Constant-time-ish password check for the login route. */
export function passwordMatches(candidate: string): boolean {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) return false;
  const a = new TextEncoder().encode(candidate);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}
