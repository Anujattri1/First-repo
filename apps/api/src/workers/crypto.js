// ---------------------------------------------------------------------------
// Pure-JS crypto helpers for the Cloudflare Workers runtime (edge repo).
//  - PBKDF2-SHA256 password hashing via WebCrypto (Workers forbid native
//    modules, so bcrypt is replaced by PBKDF2; hash prefix identifies alg).
//  - HS256 JWT sign/verify with timing-safe comparison.
// Hash format: pbkdf2$<iterations>$<hex-salt>$<hex-hash>
// NOTE: apps/api/src/workers/crypto.js must stay identical to this file
//       (it is imported by the shared handler code).
// ---------------------------------------------------------------------------

const enc = new TextEncoder();
const dec = new TextDecoder();

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function pbkdf2(password, saltBytes, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" },
    key, 256
  );
  return toHex(bits);
}

export async function hashPassword(password, iterations = 100_000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2$${iterations}$${toHex(salt)}$${hash}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [tag, iters, saltHex, hashHex] = String(stored).split("$");
    if (tag !== "pbkdf2") return false; // legacy bcrypt hash — reseed on D1 deploy
    const candidate = await pbkdf2(password, fromHex(saltHex), Number(iters));
    return timingSafeEqualHex(candidate, hashHex);
  } catch {
    return false;
  }
}

function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------- JWT (HS256) ----------
const b64uEncode = (bytes) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uDecode = (s) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export async function signJwt(payload, secret, expiresInSec = 12 * 3600) {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSec };
  const head = b64uEncode(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const data = b64uEncode(enc.encode(JSON.stringify(body)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(`${head}.${data}`));
  return `${head}.${data}.${b64uEncode(new Uint8Array(sig))}`;
}

export async function verifyJwt(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const expected = b64uEncode(new Uint8Array(
    await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(`${parts[0]}.${parts[1]}`))
  ));
  if (!timingSafeEqualHex(expected, parts[2])) return null;
  try {
    const payload = JSON.parse(dec.decode(b64uDecode(parts[1])));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
