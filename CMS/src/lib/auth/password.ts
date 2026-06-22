/**
 * Password hashing for the per-Site CMS (cms-auth Slice 1).
 *
 * Ported VERBATIM from `ProjectManager/src/lib/auth/password.ts` — the CMS now
 * has its OWN local users (email + password), mirroring PM's mechanics. Country
 * scope is irrelevant here (a CMS = one Site), but the hashing primitive is
 * identical so a future shared lib could dedupe.
 *
 * Native bcrypt/argon2 don't run on Workers (no Node addons), so this uses
 * PBKDF2-HMAC-SHA-256 via the Web Crypto API (`crypto.subtle`), available
 * natively on both the Workers runtime and Node 20+ (`globalThis.crypto`), so
 * this module is node-`--test` loadable (no `@/` imports, no CF bindings).
 *
 * The stored string is self-describing so parameters can be raised later
 * without invalidating existing hashes:
 *
 *   pbkdf2$<iterations>$<saltB64>$<hashB64>
 */

// CRITICAL — Cloudflare Workers' Web Crypto CAPS PBKDF2 at 100_000 iterations;
// requesting MORE throws NotSupportedError at RUNTIME ONLY (not at build/tsc).
// See memory `pm-workers-pbkdf2-100k-cap`. Keep this AT 100k, never above.
// Below the OWASP 2023 floor (210k), but it's the platform ceiling; the hash
// records its own iteration count, so this can be raised if the limit lifts.
const ITERATIONS = 100_000;
const KEY_LENGTH = 32; // bytes (256-bit derived key)
const SALT_LENGTH = 16; // bytes
const PREFIX = "pbkdf2";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function derive(
  password: string,
  salt: BufferSource,
  iterations: number,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    keyMaterial,
    KEY_LENGTH * 8,
  );
  return new Uint8Array(bits);
}

/** Hash a plaintext password into a self-describing, storable string. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const hash = await derive(password, salt, ITERATIONS);
  return `${PREFIX}$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

/**
 * Verify a plaintext password against a stored hash. Constant-time comparison
 * over the derived bytes; returns false on any malformed/foreign hash string.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== PREFIX) return false;

  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;

  let salt: Uint8Array<ArrayBuffer>;
  let expected: Uint8Array<ArrayBuffer>;
  try {
    salt = fromBase64(parts[2]);
    expected = fromBase64(parts[3]);
  } catch {
    return false;
  }

  const actual = await derive(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

/** Length-independent constant-time byte comparison. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Minimum password length (mirrors PM's 10-char floor). Pure check, reused by
// the future register/accept routes (Slice 2/4) — kept here so the rule lives
// next to the hashing primitive.
export const MIN_PASSWORD_LENGTH = 10;

/** True if a candidate password meets the minimum length. */
export function isPasswordLongEnough(password: string): boolean {
  return typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH;
}
