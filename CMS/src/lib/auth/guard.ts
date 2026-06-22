/**
 * CMS admin auth guard (Sec1 → cms-auth Slice 2) — impure wiring around
 * `guard-core.ts`.
 *
 * The whole CMS admin surface (/admin/* pages + /api/* admin routes) is gated by
 * `requireAdmin`. As of Slice 2 the CMS has its OWN user + session store, so the
 * guard resolves the `bizbee_session` cookie LOCALLY (D1 `session` → `user`)
 * instead of forwarding it to PM's cms-validate every request. PM's cms-validate
 * is now only the SSO HANDSHAKE (used once by `/api/auth/sso-callback` to upsert
 * the operator + mint a local session) — local email/password/Google users have
 * NO PM row, so a per-request PM forward would lock them out.
 *
 * Fail-closed: no cookie, an expired/absent session row, or a deleted user all
 * DENY. A signed-in user with a live session+row = allow.
 */
import { getSession } from "@/db/session-store";
import { findUserById } from "@/db/user-store";
import type { CmsRole } from "@/db/schema";
import { SESSION_COOKIE, readSessionCookie, type GuardDecision } from "./guard-core";
import { canManageUsers, canManageApiKeys } from "./roles";

/**
 * Resolve the current session cookie (read via `next/headers`, so it works for
 * both page/layout renders AND /api/* route handlers in the App Router) to a CMS
 * user. Both entry points below funnel through here.
 */
async function decide(): Promise<GuardDecision> {
  const session = await getSession();
  if (!session) return { allow: false, reason: "noSession" };

  const user = await findUserById(session.userId);
  if (!user) return { allow: false, reason: "noSession" };

  return { allow: true, userId: user.id, role: user.role };
}

/** Authorize an incoming /api/* `Request`. Resolves the cookie locally. */
export async function checkAdmin(_request: Request): Promise<GuardDecision> {
  // The cookie is read via next/headers inside getSession(); the Request arg is
  // kept for the existing call sites (and to assert the route is request-scoped).
  return decide();
}

/** Authorize a page/layout render. */
export async function checkAdminFromHeaders(): Promise<GuardDecision> {
  return decide();
}

/**
 * Guard an admin /api/* route. Returns a 401 `Response` to short-circuit when
 * the request is not an authorized admin, or `null` to proceed.
 *
 *   const denied = await requireAdmin(request);
 *   if (denied) return denied;
 */
export async function requireAdmin(request: Request): Promise<Response | null> {
  const decision = await checkAdmin(request);
  if (decision.allow) return null;
  return Response.json(
    { error: "unauthorized", reason: decision.reason },
    { status: 401 },
  );
}

/**
 * Role-gated /api/* guard (cms-auth Slice 3). Like `requireAdmin` it first
 * requires a signed-in CMS user (401 if not), then additionally requires the
 * user's role to satisfy `allowed` — a 403 `forbidden` otherwise. Use this for
 * routes that are not open to every CMS user (e.g. user management):
 *
 *   const denied = await requireRole(request, canManageUsers);
 *   if (denied) return denied;
 *
 * Distinct status codes: 401 = not signed in (re-auth), 403 = signed in but the
 * role isn't permitted (no re-auth helps). The page layer mirrors this via
 * `checkRoleFromHeaders`.
 */
export async function requireRole(
  request: Request,
  allowed: (role: CmsRole) => boolean,
): Promise<Response | null> {
  const decision = await checkAdmin(request);
  if (!decision.allow) {
    return Response.json(
      { error: "unauthorized", reason: decision.reason },
      { status: 401 },
    );
  }
  if (!decision.role || !allowed(decision.role)) {
    return Response.json({ error: "forbidden", reason: "forbidden" }, { status: 403 });
  }
  return null;
}

/** Convenience: the user-management surface requires Manager+ (`canManageUsers`). */
export function requireUserManager(request: Request): Promise<Response | null> {
  return requireRole(request, canManageUsers);
}

/** Convenience: the API-key surface requires Admin+ (`canManageApiKeys`). */
export function requireApiKeyManager(request: Request): Promise<Response | null> {
  return requireRole(request, canManageApiKeys);
}

/**
 * Page-layer role gate (cms-auth Slice 3). Returns the same `GuardDecision` shape
 * `checkAdminFromHeaders` does, but flips an allowed signed-in user whose role
 * fails `allowed` to a `forbidden` deny — so an /admin/* page can render a
 * "you don't have access" notice instead of its content. The /api/* layer
 * (`requireRole`) is the real enforcement; this is defense-in-depth for the UI.
 */
export async function checkRoleFromHeaders(
  allowed: (role: CmsRole) => boolean,
): Promise<GuardDecision> {
  const decision = await decide();
  if (decision.allow && (!decision.role || !allowed(decision.role))) {
    return { allow: false, reason: "forbidden" };
  }
  return decision;
}

// Re-exported for callers that still want the raw cookie name/extractor.
export { SESSION_COOKIE, readSessionCookie };
export { canManageUsers, canManageApiKeys, canEditContent, canInvite, canRemoveUser, canChangeRole } from "./roles";
