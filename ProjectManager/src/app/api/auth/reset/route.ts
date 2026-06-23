import { NextResponse } from "next/server";
import { validatePassword } from "@/lib/auth/validation";
import { applyReset } from "@/lib/reset/reset";

type Body = { token?: unknown; password?: unknown; confirmPassword?: unknown };

/**
 * REST "set new password from reset token" endpoint.
 *
 * Validates the token (exists, unused, not expired) and the new password
 * (min-length matching register), then sets a fresh hash, marks the token used
 * (single-use), and invalidates the user's existing sessions so a leaked/old
 * session can't survive the reset.
 *
 * Invalid/expired/used tokens all return the SAME generic `resetTokenInvalid`
 * error — never reveal why, so the response leaks no token/account detail.
 *
 * REST route handler (not a server action — those 500 on OpenNext/Workers).
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "unknown" }, { status: 400 });
  }

  const token = String(body.token ?? "");
  const password = String(body.password ?? "");
  const confirm = String(body.confirmPassword ?? "");

  if (!token) {
    return NextResponse.json({ error: "resetTokenInvalid" }, { status: 400 });
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }
  if (password !== confirm) {
    return NextResponse.json({ error: "passwordMismatch" }, { status: 400 });
  }

  const result = await applyReset(token, password);
  if (!result.ok) {
    // Generic error for notFound/expired/used — no detail leak.
    return NextResponse.json({ error: "resetTokenInvalid" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
