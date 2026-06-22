/**
 * AES-256-GCM authenticated encryption for per-Site secrets (e.g. a Site's own
 * OpenRouter API key) stored at rest in PM's D1.
 *
 * Uses Web Crypto `crypto.subtle`, available on Cloudflare Workers — NO Node
 * crypto, NO PBKDF2 (avoids the Workers 100k-iteration cap; see MEMORY). The KEK
 * is a 32-byte random key supplied as base64 (`SITE_SECRET_KEY` PM env secret)
 * and used directly as the AES-256 key.
 *
 * Wire format of an encrypted blob: base64( iv[12] ‖ ciphertext+tag ). GCM's
 * 16-byte auth tag is appended to the ciphertext by `subtle.encrypt`, so a
 * tampered blob or wrong key fails authentication and THROWS — never returns
 * garbage plaintext.
 */

const IV_BYTES = 12; // GCM standard nonce length

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function importKey(keyB64: string): Promise<CryptoKey> {
  const raw = b64decode(keyB64);
  if (raw.length !== 32) {
    throw new Error(
      `SITE_SECRET_KEY must be 32 bytes (base64), got ${raw.length}`,
    );
  }
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Encrypt `plaintext` → base64(iv ‖ ciphertext+tag). Random IV per call. */
export async function encryptSecret(
  plaintext: string,
  keyB64: string,
): Promise<string> {
  const key = await importKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(IV_BYTES)));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  const blob = new Uint8Array(iv.length + ct.length);
  blob.set(iv, 0);
  blob.set(ct, iv.length);
  return b64encode(blob);
}

/** Decrypt a base64(iv ‖ ciphertext+tag) blob. Throws on tamper/wrong key/short. */
export async function decryptSecret(
  blob: string,
  keyB64: string,
): Promise<string> {
  const bytes = b64decode(blob);
  // iv(12) + at least the 16-byte GCM tag.
  if (bytes.length < IV_BYTES + 16) {
    throw new Error("encrypted blob too short");
  }
  const key = await importKey(keyB64);
  const iv = bytes.subarray(0, IV_BYTES);
  const ct = bytes.subarray(IV_BYTES);
  let pt: ArrayBuffer;
  try {
    pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  } catch {
    // GCM auth-tag mismatch (tampered ciphertext or wrong key) — clean throw,
    // never leak partial/garbage plaintext.
    throw new Error("decryption failed: invalid key or tampered ciphertext");
  }
  return new TextDecoder().decode(pt);
}
