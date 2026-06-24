/**
 * AES-256-GCM authenticated encryption for per-Site secrets stored at rest in the
 * CMS's OWN D1 — first use: a customer's Google OAuth client secret (cms-auth
 * GOOGLE-CLIENT REWORK). Mirrors PM's `lib/crypto/secret-box.ts` verbatim (the
 * CMS-local secret-box the rework calls for).
 *
 * Uses Web Crypto `crypto.subtle`, available on Cloudflare Workers — NO Node
 * crypto, NO PBKDF2 (avoids the Workers 100k-iteration cap; see MEMORY). The KEK
 * is ANY non-empty string; we SHA-256-derive it to the exact 32 bytes AES-256
 * needs (see `deriveKey`). The CMS reuses its existing `CMS_AUTH_SECRET` Worker
 * var as the KEK (already deployer-injected; no new secret to provision) — and
 * that var is a 48-byte base64 bearer/HMAC secret, NOT 32 bytes, which is why we
 * derive rather than use it raw — see google-client-store.
 *
 * Wire format of an encrypted blob: base64( iv[12] ‖ ciphertext+tag ). GCM's
 * 16-byte auth tag is appended to the ciphertext by `subtle.encrypt`, so a
 * tampered blob or wrong key fails authentication and THROWS — never returns
 * garbage plaintext.
 *
 * Pure module: NO `@/` imports, NO CF bindings (only `globalThis.crypto`), so it's
 * node-testable like password.ts / google-core.ts.
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

/**
 * Derive a fixed 32-byte AES-256 key from ANY non-empty KEK string via SHA-256.
 * The KEK is `CMS_AUTH_SECRET`, which is minted/injected as a 48-byte base64
 * bearer/HMAC secret (length is flexible there) — NOT the exact 32 bytes AES-256
 * needs. SHA-256 deterministically normalises any length to 32 bytes, so the same
 * KEK always yields the same AES key and existing deploys work without re-minting
 * the secret. We hash the RAW UTF-8 KEK string (not its base64-decode) so the
 * derivation is independent of whether the KEK happens to be valid base64.
 */
async function deriveKey(kek: string): Promise<Uint8Array<ArrayBuffer>> {
  if (!kek) throw new Error("secret-box KEK is empty");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(kek),
  );
  // Copy into a fresh ArrayBuffer-backed view so importKey's BufferSource type
  // is satisfied (subtle.digest returns ArrayBufferLike). Always 32 bytes.
  const out = new Uint8Array(new ArrayBuffer(digest.byteLength));
  out.set(new Uint8Array(digest));
  return out;
}

async function importKey(kek: string): Promise<CryptoKey> {
  const raw = await deriveKey(kek);
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
