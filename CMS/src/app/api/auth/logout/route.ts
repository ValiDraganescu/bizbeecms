import { destroySession } from "@/db/session-store";

/**
 * CMS-local logout (cms-auth). Deletes the current session row from D1 and
 * clears the `bizbee_session` cookie via `destroySession()` — server-side
 * invalidation, so the session is dead even if the cookie lingers. Applies to
 * EVERY session notion on the CMS host (local email/password, Google, and the
 * auto-provisioned SSO/operator user all mint the same `bizbee_session`).
 *
 * POST-only (state change; a GET would be CSRF-triggerable via a stray image tag).
 * Idempotent: no session → still 200 (nothing to destroy). No auth gate needed
 * — the worst an unauthenticated caller can do is clear their own (absent)
 * cookie. REST route handler, not a server action (server actions 500 on OpenNext).
 */
export async function POST(): Promise<Response> {
  await destroySession();
  return Response.json({ ok: true }, { status: 200 });
}
