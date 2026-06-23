import { verifyPassword } from "@/lib/auth/password";
import { findUserByEmail, normalizeEmail } from "@/db/user-store";
import { createSession } from "@/db/session-store";
import {
  recentFailureTimestamps,
  recordFailure,
  clearFailures,
} from "@/db/login-attempt-store";
import { decideThrottle } from "@/lib/auth/throttle-core";

/**
 * CMS-local email/password login (cms-auth Slice 2). Verifies against the Slice 1
 * `user` table and mints a CMS-LOCAL session (the guard resolves it locally now —
 * no PM forward). SSO-only / Google-only users have `passwordHash = NULL` and
 * CANNOT log in here (they use their own button). No self-signup: an unknown
 * email is rejected exactly like a wrong password (same generic error + status,
 * so the response can't be used to enumerate which emails exist).
 *
 * BRUTE-FORCE THROTTLE (cms-auth): failed attempts are counted per-email in D1
 * over a sliding window (no KV on the CMS Worker). Once the limit is reached the
 * request is rejected with 429 BEFORE the password check — so an attacker can't
 * keep guessing. A successful login clears the counter. Non-enumerating: a 429
 * means "too many attempts for this email", which is recorded for unknown emails
 * too, so it never reveals whether an email exists.
 *
 * REST route handler, not a server action (server actions 500 on OpenNext).
 */
type Body = { email?: unknown; password?: unknown };

export async function POST(request: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "badRequest" }, { status: 400 });
  }

  const rawEmail = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!rawEmail || !password) {
    return Response.json({ error: "badRequest" }, { status: 400 });
  }
  const email = normalizeEmail(rawEmail);

  // Throttle BEFORE the (expensive + revealing) password check.
  const now = Date.now();
  const throttle = decideThrottle(await recentFailureTimestamps(email, now), now);
  if (throttle.locked) {
    const retryAfter = Math.ceil(throttle.retryAfterMs / 1000);
    return Response.json(
      { error: "tooManyAttempts" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const user = await findUserByEmail(email);
  // Same generic failure for unknown email, SSO-only user, or wrong password —
  // no enumeration. `passwordHash` is NULL for SSO/Google users (no local login).
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    await recordFailure(email, now);
    return Response.json({ error: "invalidCredentials" }, { status: 401 });
  }

  await clearFailures(email);
  await createSession(user.id);
  return Response.json({ ok: true }, { status: 200 });
}
