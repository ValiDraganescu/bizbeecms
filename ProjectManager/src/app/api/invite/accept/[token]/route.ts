import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth/session";
import { validatePassword } from "@/lib/auth/validation";
import { acceptInvite, type InviteStatus } from "@/lib/invite/invite";

export type AcceptError =
  | "passwordRequired"
  | "passwordTooShort"
  | "passwordMismatch"
  | InviteStatus
  | "emailTaken"
  | "unknown";

type Body = { password?: unknown; confirmPassword?: unknown };

/**
 * REST accept-invite endpoint (replaces the former server action). Validates
 * the password, creates the user from the invite's role/country, marks the
 * invite used, and starts a session. The token comes from the route — the
 * invitee never chooses their role/email/country. On success sets the session
 * cookie and returns `{ ok: true }`; the client redirects.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "unknown" }, { status: 400 });
  }

  const password = String(body.password ?? "");
  const confirm = String(body.confirmPassword ?? "");

  const passwordError = validatePassword(password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }
  if (password !== confirm) {
    return NextResponse.json({ error: "passwordMismatch" }, { status: 400 });
  }

  const result = await acceptInvite(token, password);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  await createSession(result.user.id);
  return NextResponse.json({ ok: true });
}
