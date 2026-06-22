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
 * Should the login page show the "Sign in with BizbeeCMS" SSO button? Only when
 * the visitor arrived from PM. We detect that from an explicit `?from=pm` query
 * hint OR a `Referer` whose origin matches the configured `PM_ORIGIN` (NEVER a
 * hardcoded domain — same config-driven host handling as `forwarded-host`). The
 * SSO handoff itself stays gated behind this button so operators keep their flow
 * while a client's own team just sees email/password.
 *
 * Pure + node-testable: takes the raw `Referer` header, the `from` param, and the
 * configured origin; no fetch/env. Missing `pmOrigin` ⇒ never show (fail-closed:
 * an unconfigured CMS can't honor the SSO handoff anyway).
 */
export function shouldShowSsoButton(
  referer: string | null,
  fromParam: string | null,
  pmOrigin: string | undefined,
): boolean {
  if (!pmOrigin) return false;
  if (fromParam === "pm") return true;
  if (!referer) return false;
  try {
    return new URL(referer).origin === new URL(pmOrigin).origin;
  } catch {
    return false;
  }
}

export type ValidateResponse = { ok?: unknown; userId?: unknown };

export type GuardDecision =
  | { allow: true; userId?: string }
  | { allow: false; reason: "unconfigured" | "noSession" | "denied" | "error" };

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
