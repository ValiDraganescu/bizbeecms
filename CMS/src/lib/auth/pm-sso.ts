/**
 * PM-SSO operator predicate (ai-widget-ux — PM-SSO debug tasks).
 *
 * Some debug-only surfaces (chat export, system-prompt editor) are restricted to
 * operators who arrived via the PM "Sign in with BizbeeCMS" SSO handshake — NOT
 * local email/password users, NOT Google users. The signal we have on a CMS user
 * row is the email: `upsertSsoUser` keys a pre-email SSO row on the synthetic
 * `<pmUserId>@pm.sso` address (see `db/user-store.ts:ssoSyntheticEmail`).
 *
 * Pure — no D1/React/fetch imports — so `node --test` loads it directly and the
 * server guard (`pm-sso-guard.ts`) wraps it with the user lookup.
 *
 * ponytail: synthetic-email match is the only durable signal the user table
 * exposes. CAVEAT: once PM returns a real email, `upsertSsoUser` BACKFILLS the
 * synthetic row to the real address, so a long-lived SSO operator can stop
 * matching. Upgrade path if that bites: add an explicit `origin` column to the
 * user table and key off that instead of the email.
 */

/** The synthetic-email domain SSO-provisioned rows are keyed on (no real email). */
export const PM_SSO_EMAIL_SUFFIX = "@pm.sso";

/** True iff `email` is a PM-SSO synthetic address. Case-insensitive, trimmed. */
export function isPmSsoEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(PM_SSO_EMAIL_SUFFIX);
}

/** True iff the user row is a PM-SSO operator (synthetic `@pm.sso` email). */
export function isPmSsoUser(user: { email: string | null | undefined } | null | undefined): boolean {
  return isPmSsoEmail(user?.email);
}
