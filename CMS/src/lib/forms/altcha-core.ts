/**
 * ALTCHA proof-of-work bot protection for Form-block submissions — the PURE
 * parameters + helpers (dep-free, node-tested). The effects live elsewhere:
 * the challenge route mints challenges (altcha-lib `createChallenge`), the
 * submit route verifies payloads (altcha-lib frameworks `verify`) and burns
 * used challenges through the D1-backed replay store.
 *
 * MODEL: deterministic PoW. The server picks a random counter, derives ONE
 * PBKDF2 key at that counter (cost iterations — a single bounded derive, far
 * under the Workers 100k-iteration PBKDF2 cap) and publishes its prefix. The
 * browser must brute-force counters until the prefix matches, so a visitor
 * pays `~counter × cost` hash rounds while the server pays `cost` once, and
 * verification is HMAC-only (key signature) — no PBKDF2 on the verify path.
 */

/** Form field carrying the solved payload (the widget's default input name). */
export const ALTCHA_FIELD = "altcha";

/** The public endpoint the widget fetches a fresh challenge from. */
export const FORM_CHALLENGE_PATH = "/api/forms/challenge";

/** PoW algorithm + difficulty. `cost` is PBKDF2 iterations PER counter try;
 *  the counter range bounds the tries — average visitor work is
 *  `cost × (min+max)/2` hash rounds (~1M ≈ well under a second on desktop,
 *  a couple of seconds on a slow phone), which is what makes bulk automated
 *  submission uneconomical while staying invisible to a human. */
export const ALTCHA_ALGORITHM = "PBKDF2/SHA-256";
export const ALTCHA_COST = 250;
export const ALTCHA_COUNTER_MIN = 1_000;
export const ALTCHA_COUNTER_MAX = 8_000;

/** Challenge lifetime. MUST stay ≤ the login_attempt store window (15 min) —
 *  the replay guard rides that table, so a challenge must expire before its
 *  used-marker row can age out. */
export const ALTCHA_EXPIRY_MS = 10 * 60 * 1000;

/** Random counter inside [min, max] from a uniform [0,1) roll — keeps the
 *  minimum work floor (a counter of 3 would be free to brute-force). */
export function altchaCounter(roll: number): number {
  const span = ALTCHA_COUNTER_MAX - ALTCHA_COUNTER_MIN;
  return ALTCHA_COUNTER_MIN + Math.min(span, Math.max(0, Math.floor(roll * (span + 1))));
}

/** When a challenge minted `now` stops verifying. */
export function altchaExpiresAt(now: number): Date {
  return new Date(now + ALTCHA_EXPIRY_MS);
}

/** login_attempt key marking one challenge id as used (replay guard). The id
 *  is the challenge nonce — unique per mint, opaque to the visitor. */
export function altchaReplayKey(challengeId: string): string {
  return `altcha:${challengeId}`;
}

/** Domain-separated HMAC secrets derived from the site KEK — one signs the
 *  challenge parameters, the other signs the derived key (so verify never
 *  re-runs PBKDF2). Deterministic: mint and verify must agree. */
export function altchaSecrets(kek: string): { signature: string; key: string } {
  return { signature: `${kek}|altcha-sig`, key: `${kek}|altcha-key` };
}

// ── Guest-visible refusals ───────────────────────────────────────────────────
// These land verbatim in the visitor's status region (the enhance script shows
// the server text for bot-protection refusals), so they arrive already
// translated — same model as `guestQuotaMessage`: coverage matches the
// product's shipped translations (en/fi/et), and the fallback chain matches
// `resolveLocalized`: active content locale → the Site's default → English.

export type GuestMessageDict = Record<string, string> & { en: string };

/** Resolve one guest message dict through the standard locale chain. Codes are
 *  matched case-insensitively (the cookie carries whatever the switcher wrote);
 *  an unshipped locale falls through to the Site default, then English. */
export function pickGuestMessage(
  dict: GuestMessageDict,
  locale: string,
  siteDefaultLocale: string,
): string {
  return dict[locale.toLowerCase()] ?? dict[siteDefaultLocale.toLowerCase()] ?? dict.en;
}

export const ALTCHA_MISSING_ERROR: GuestMessageDict = {
  en: "Verification is required. Enable JavaScript and try again.",
  fi: "Vahvistus vaaditaan. Ota JavaScript käyttöön ja yritä uudelleen.",
  et: "Kinnitamine on nõutav. Luba JavaScript ja proovi uuesti.",
};

export const ALTCHA_FAILED_ERROR: GuestMessageDict = {
  en: "Verification failed. Refresh the page and try again.",
  fi: "Vahvistus epäonnistui. Päivitä sivu ja yritä uudelleen.",
  et: "Kinnitamine ebaõnnestus. Värskenda lehte ja proovi uuesti.",
};
