/**
 * Invite/reset email SUBJECT builder — pure, alias-free so `node --test` can run
 * it (send-invite.ts imports `@opennextjs/cloudflare` at module load and can't be
 * loaded under the test runner).
 *
 * BUG (2026-06-26): when a site has a CUSTOM DOMAIN attached, the invite subject
 * must carry that domain — `"<domain>: You are invited to use BizBeeCMS"` — so the
 * recipient sees which site invited them. Sites still on the default
 * `*.workers.dev` host get the generic subject.
 *
 * The domain is derived from `APP_ORIGIN`'s host (the same value the accept-link is
 * built from in send-invite.ts) so the subject stays CONSISTENT with the link.
 * Once the deployer sets APP_ORIGIN to the primary custom domain (the shared fix
 * tracked in `sso`/`cms-mcp`), this automatically prefixes; until then APP_ORIGIN
 * is workers.dev and the generic subject is used — no behavior change pre-fix.
 */

/**
 * Extract the bare domain from an APP_ORIGIN, or `null` if it's empty, malformed,
 * or a default `*.workers.dev` host (which is NOT a custom domain). Strips a
 * leading `www.` so the domain reads cleanly.
 */
export function customDomain(appOrigin: string | undefined): string | null {
  if (!appOrigin || typeof appOrigin !== "string") return null;
  let host: string;
  try {
    host = new URL(appOrigin).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host || host.endsWith(".workers.dev") || host === "localhost") return null;
  return host.replace(/^www\./, "");
}

/**
 * Build the invite subject: domain-prefixed when a custom domain is attached,
 * otherwise the generic subject.
 *
 * @param appOrigin        the APP_ORIGIN Worker var (link origin)
 * @param genericSubject   the plain subject (no custom domain)
 * @param withDomain       fn that renders the prefixed subject from the domain
 *                         (e.g. `(d) => t("subjectWithDomain", { domain: d })`)
 */
export function inviteSubject(
  appOrigin: string | undefined,
  genericSubject: string,
  withDomain: (domain: string) => string,
): string {
  const domain = customDomain(appOrigin);
  return domain ? withDomain(domain) : genericSubject;
}
