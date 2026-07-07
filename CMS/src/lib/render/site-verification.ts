/**
 * Per-Site search-engine verification tokens (seo-robots goal) — PURE module.
 *
 * Search Console / Webmaster tools verify site ownership by having you add a
 * `<meta name="…" content="<token>">` tag. This module holds the token set an
 * operator pastes in Settings; `generateMetadata` on the (site) render path
 * folds it into Next's `Metadata.verification` so every published page carries
 * the tags. STATIC per site — the tokens are stored site data, never derived
 * from the request, so they're safe on the edge-cached published-page path
 * (see the visitor-independence caveat).
 *
 * Providers:
 *   - google → Next `verification.google` → <meta name="google-site-verification">
 *   - yandex → Next `verification.yandex` → <meta name="yandex-verification">
 *   - bing   → Next `verification.other["msvalidate.01"]` (Next has no first-class
 *              Bing field; the `other` map emits an arbitrary name→content meta).
 *
 * PURE (no React/D1/CF imports) so it runs under the dep-free `node --test`
 * convention. The D1 read/write lives in `db/settings-store.ts`.
 */

export type SiteVerification = {
  /** google-site-verification token (the CONTENT value, not the whole tag). */
  google: string;
  /** msvalidate.01 token for Bing Webmaster Tools. */
  bing: string;
  /** yandex-verification token. */
  yandex: string;
};

export const VERIFICATION_FIELDS = ["google", "bing", "yandex"] as const;

// A verification token is an opaque provider-issued string. Bound the length so
// a runaway/hostile value can't bloat every page's <head>; strip everything but
// the token charset providers actually use (alphanumerics, `-`, `_`, `.`) so a
// pasted-with-the-tag-around-it value or an injection attempt can't forge extra
// meta attributes. Real tokens are ~40–70 chars.
const MAX_TOKEN = 200;
const TOKEN_STRIP = /[^A-Za-z0-9._-]/g;

export function emptySiteVerification(): SiteVerification {
  return { google: "", bing: "", yandex: "" };
}

/**
 * Validate + normalize raw verification input (parsed settings JSON or a PUT
 * body). Per field: coerce to string, trim, strip any char outside the token
 * charset, clamp to MAX_TOKEN. Non-string / missing → "". Never throws — garbage
 * in → an empty set. Extra keys dropped.
 */
export function normalizeSiteVerification(raw: unknown): SiteVerification {
  const out = emptySiteVerification();
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return out;
  const obj = raw as Record<string, unknown>;
  for (const field of VERIFICATION_FIELDS) {
    const v = obj[field];
    if (typeof v !== "string") continue;
    out[field] = v.trim().replace(TOKEN_STRIP, "").slice(0, MAX_TOKEN);
  }
  return out;
}

/** True when nothing is set (so generateMetadata can omit the whole block). */
export function isEmptyVerification(v: SiteVerification): boolean {
  return VERIFICATION_FIELDS.every((f) => v[f] === "");
}

/**
 * Build Next's `Metadata.verification` from the stored tokens, or undefined when
 * nothing is set (so Next emits no verification meta). Only non-empty tokens
 * become fields; Bing rides the `other` map under `msvalidate.01`.
 */
export function buildVerificationMeta(
  v: SiteVerification,
): { google?: string; yandex?: string; other?: Record<string, string> } | undefined {
  if (isEmptyVerification(v)) return undefined;
  const meta: { google?: string; yandex?: string; other?: Record<string, string> } = {};
  if (v.google) meta.google = v.google;
  if (v.yandex) meta.yandex = v.yandex;
  if (v.bing) meta.other = { "msvalidate.01": v.bing };
  return meta;
}
