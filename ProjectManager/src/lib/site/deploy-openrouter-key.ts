/**
 * Slice 3 (per-Site OpenRouter key TRACK): decide the deploy POST body's
 * OpenRouter field from a Site's encrypted key.
 *
 * The deploy route owns the actual decrypt (it needs the env KEK); this pure
 * helper just turns "(encrypted-or-null, a decrypt thunk)" into the field to
 * merge into the deployer body — so the include/omit/degrade logic is testable
 * without Web Crypto or a real key.
 *
 * Contract (matches Slice 2 + Slice 4): the body field is `openrouterApiKey`
 * (plaintext, present ONLY when the Site has a key AND it decrypts cleanly).
 * - encrypted === null/empty → omit (Site has no key; deployer uses its global fallback).
 * - decrypt succeeds            → include `{ openrouterApiKey: <plaintext> }`.
 * - decrypt THROWS (bad/rotated/unset KEK, corrupt blob) → omit + `degraded: true`.
 *   The deploy MUST proceed; never crash because of the key.
 */
export function decideDeployOpenrouterField(
  encryptedOrNull: string | null | undefined,
  decrypt: (blob: string) => string,
): { body: { openrouterApiKey?: string }; degraded: boolean } {
  if (typeof encryptedOrNull !== "string" || encryptedOrNull === "") {
    return { body: {}, degraded: false };
  }
  try {
    const plaintext = decrypt(encryptedOrNull);
    return { body: { openrouterApiKey: plaintext }, degraded: false };
  } catch {
    // Graceful degrade: omit the field, flag it, let the caller log + proceed.
    return { body: {}, degraded: true };
  }
}
