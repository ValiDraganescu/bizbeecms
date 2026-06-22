import { verifyPassword } from "@/lib/auth/password";
import { findUserByEmail } from "@/db/user-store";
import { createSession } from "@/db/session-store";

/**
 * CMS-local email/password login (cms-auth Slice 2). Verifies against the Slice 1
 * `user` table and mints a CMS-LOCAL session (the guard resolves it locally now —
 * no PM forward). SSO-only / Google-only users have `passwordHash = NULL` and
 * CANNOT log in here (they use their own button). No self-signup: an unknown
 * email is rejected exactly like a wrong password (same generic error + status,
 * so the response can't be used to enumerate which emails exist).
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

  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return Response.json({ error: "badRequest" }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  // Same generic failure for unknown email, SSO-only user, or wrong password —
  // no enumeration. `passwordHash` is NULL for SSO/Google users (no local login).
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    return Response.json({ error: "invalidCredentials" }, { status: 401 });
  }

  await createSession(user.id);
  return Response.json({ ok: true }, { status: 200 });
}
