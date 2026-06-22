import { hashPassword, isPasswordLongEnough } from "@/lib/auth/password";
import { createSession } from "@/db/session-store";
import { acceptInvite } from "@/db/invite-store";
import type { InviteStatus } from "@/lib/invite/invite-core";

/**
 * CMS accept-invite endpoint (cms-auth Slice 4). Validates the password, creates
 * the CMS user from the invite's role (the invitee never chooses email/role —
 * those come from the token), marks the invite used, and mints a CMS-local
 * session. On success sets the `bizbee_session` cookie and returns `{ ok: true }`;
 * the client redirects to /admin.
 *
 * REST route handler, not a server action (server actions 500 on OpenNext).
 */
export type AcceptError =
  | "passwordRequired"
  | "passwordTooShort"
  | "passwordMismatch"
  | InviteStatus
  | "emailTaken"
  | "unknown";

type Body = { password?: unknown; confirmPassword?: unknown };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "unknown" }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  const confirm = typeof body.confirmPassword === "string" ? body.confirmPassword : "";

  if (!password) {
    return Response.json({ error: "passwordRequired" }, { status: 400 });
  }
  if (!isPasswordLongEnough(password)) {
    return Response.json({ error: "passwordTooShort" }, { status: 400 });
  }
  if (password !== confirm) {
    return Response.json({ error: "passwordMismatch" }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const result = await acceptInvite(token, passwordHash);
  if (!result.ok) {
    return Response.json({ error: result.reason }, { status: 400 });
  }

  await createSession(result.user.id);
  return Response.json({ ok: true }, { status: 200 });
}
