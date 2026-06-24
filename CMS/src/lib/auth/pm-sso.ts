/**
 * PM-SSO operator predicate (ai-widget-ux — PM-SSO debug tasks).
 *
 * Some debug-only surfaces (chat export, system-prompt editor) are restricted to
 * operators who arrived via the PM "Sign in with BizbeeCMS" SSO handshake — NOT
 * local email/password users, NOT Google users.
 *
 * The durable signal is the `user.pmUserId` column, set by `upsertSsoUser` for
 * every SSO row (and backfilled on existing rows on next login). The email is NOT
 * a reliable signal: `upsertSsoUser` keys SSO rows on the operator's REAL email
 * (e.g. a gmail address), so the `@pm.sso` synthetic suffix only appears on legacy
 * rows provisioned before PM returned a real email. We keep the suffix as a
 * fallback for any such row not yet re-stamped with pmUserId.
 *
 * Pure — no D1/React/fetch imports — so `node --test` loads it directly and the
 * server guard wraps it with the user lookup.
 */

/** The synthetic-email domain legacy SSO rows (no real email) were keyed on. */
export const PM_SSO_EMAIL_SUFFIX = "@pm.sso";

/** True iff `email` is a PM-SSO synthetic address. Case-insensitive, trimmed. */
export function isPmSsoEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(PM_SSO_EMAIL_SUFFIX);
}

/**
 * True iff the user row is a PM-SSO operator. Primary signal: a non-empty
 * `pmUserId` (set by the SSO handshake). Fallback: a legacy synthetic `@pm.sso`
 * email on rows provisioned before the pmUserId column existed.
 */
export function isPmSsoUser(
  user: { email: string | null | undefined; pmUserId?: string | null } | null | undefined,
): boolean {
  if (!user) return false;
  if (typeof user.pmUserId === "string" && user.pmUserId.trim() !== "") return true;
  return isPmSsoEmail(user.email);
}
