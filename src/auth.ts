// Minimal, dependency-free signed-token auth for the Worker.
//
// This issues a compact `base64url(payload).base64url(hmac-sha256 signature)`
// token — enough to (a) prove the holder knows a valid phone+PIN at issue
// time, and (b) let protected routes recover { role, phone, name, staffId }
// without a DB round-trip. Not a full JWT implementation, but the same idea.

export type Role = "owner" | "staff";

export interface AuthPayload {
  role: Role;
  phone: string;
  name: string;
  staffId?: string;
  iat: number; // issued-at, epoch seconds
  exp: number; // expiry, epoch seconds
}

function toBase64Url(bytes: Uint8Array): string {
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64url.length / 4) * 4, "=");
  const str = atob(b64);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days — this is an internal tool, favor "stay logged in"

export async function createToken(
  payload: Omit<AuthPayload, "iat" | "exp">,
  secret: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const full: AuthPayload = { ...payload, iat: now, exp: now + TOKEN_TTL_SECONDS };
  const payloadBytes = new TextEncoder().encode(JSON.stringify(full));
  const payloadB64 = toBase64Url(payloadBytes);

  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  const sigB64 = toBase64Url(new Uint8Array(sig));

  return `${payloadB64}.${sigB64}`;
}

export async function verifyToken(token: string, secret: string): Promise<AuthPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;

  try {
    const key = await hmacKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(sigB64),
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64))) as AuthPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
