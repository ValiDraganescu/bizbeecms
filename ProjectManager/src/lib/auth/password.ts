/**
 * Password hashing for Cloudflare Workers.
 *
 * Native bcrypt/argon2 don't run on Workers (no Node addons), so we use
 * PBKDF2-HMAC-SHA-256 via the Web Crypto API (`crypto.subtle`), which is
 * available natively in the Workers runtime. Each password gets a random
 * 16-byte salt; the stored string is self-describing so the parameters can be
 * raised later without invalidating existing hashes:
 *
 *   pbkdf2$<iterations>$<saltB64>$<hashB64>
 */

const ITERATIONS = 210_000; // OWASP 2023 floor for PBKDF2-HMAC-SHA-256
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
