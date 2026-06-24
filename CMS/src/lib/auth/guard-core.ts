/**
 * Pure decision logic for the CMS admin auth guard (Sec1). NO React / D1 / CF /
 * fetch imports here so the dep-free `node --test` can load it directly.
 *
 * The CMS Worker can't resolve PM's session itself — it forwards the incoming
 * `bizbee_session` cookie to PM's `/api/auth/cms-validate`. These helpers cover
 * (a) what to forward and (b) how to read PM's answer, so the impure wiring
 * (in `guard.ts`) is just env + fetch.
 */

export const SESSION_COOKIE = "bizbee_session";

export type GuardConfig = {
  /** PM origin (e.g. https://pm.example.com) — where cms-validate lives. */
  pmOrigin?: string;
  /** Shared bearer secret PM checks (CMS_AUTH_SECRET). */
  authSecret?: string;
  /** This deployed CMS's Site id (injected as a Worker var by the deployer). */
  siteId?: string;
};

/** The guard can only call PM when fully configured. Missing config = deny. */
export function isGuardConfigured(cfg: GuardConfig): cfg is Required<GuardConfig> {
  return (
    typeof cfg.pmOrigin === "string" &&
    cfg.pmOrigin.length > 0 &&
    typeof cfg.authSecret === "string" &&
    cfg.authSecret.length > 0 &&
    typeof cfg.siteId === "string" &&
    cfg.siteId.length > 0
  );
}

/** The PM cms-validate URL for a configured origin (trailing slashes trimmed). */
export function cmsValidateUrl(pmOrigin: string): string {
  return `${pmOrigin.replace(/\/+$/, "")}/api/auth/cms-validate`;
}

/**
 * Extract the `bizbee_session` value from a raw Cookie header. Returns "" when
 * absent — the guard treats "no cookie" as "not signed in" (deny), it does NOT
 * skip the PM check, so an attacker can't bypass by omitting the cookie.
 */
export function readSessionCookie(cookieHeader: string | null): string {
  if (!cookieHeader) return "";
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (name === SESSION_COOKIE) return part.slice(eq + 1).trim();
  }
  return "";
}

/**
 * Should the login page show the "Sign in with BizbeeCMS" SSO button? Whenever a
 * `PM_ORIGIN` is configured — i.e. whenever this CMS CAN honor the SSO handoff.
 *
 * We previously gated this on the visitor arriving from PM (a `?from=pm` hint or a
 * matching `Referer`), but that detection was fragile: a Next layout doesn't
 * reliably receive the query string, and an apex→www 301 (or any cross-host hop)
 * strips the Referer — so a PM admin opening /admin would lose the button. Showing
 * it whenever PM_ORIGIN is set is simpler and safe: the button only LINKS to PM's
 * cms-sso, which is itself access-gated, so a client's own team clicking it is just
 * bounced by PM's auth. Email/password stays the primary path for non-PM users.
 *
 * Pure + node-testable: just the configured origin, no fetch/env. Missing
 * `pmOrigin` ⇒ never show (fail-closed: an unconfigured CMS can't honor SSO).
 */
export function shouldShowSsoButton(pmOrigin: string | undefined): boolean {
  return Boolean(pmOrigin);
}

export type ValidateResponse = { ok?: unknown; userId?: unknown };

export type GuardDecision =
  | { allow: true; userId?: string; role?: import("../../db/schema.ts").CmsRole }
  | {
      allow: false;
      reason: "unconfigured" | "noSession" | "denied" | "error" | "forbidden";
    };

/**
 * Decide access from PM's cms-validate answer. ONLY a 200 with `{ok:true}` is an
 * allow — any other status (401 bad secret, 5xx PM down), a non-true `ok`, or a
 * thrown/unparseable body is a DENY. Fail-closed: when in doubt, lock out.
 */
export function decideFromValidate(
  status: number,
  body: ValidateResponse | null,
): GuardDecision {
  if (status === 200 && body && body.ok === true) {
    return {
      allow: true,
      userId: typeof body.userId === "string" ? body.userId : undefined,
    };
  }
  return { allow: false, reason: "denied" };
}
