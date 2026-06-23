import { isPasswordLongEnough } from "@/lib/auth/password";
import { applyReset } from "@/lib/reset/reset";

type Body = { token?: unknown; password?: unknown; confirmPassword?: unknown };

/**
 * CMS "set new password from reset token" endpoint (auth-reset C3; mirrors PM P3).
 *
 * Validates the token (exists, unused, not expired) and the new password
 * (min-length matching register/invite-accept), then marks the token used
 * (single-use, TOCTOU-safe), sets a fresh hash, and invalidates the user's
 * existing sessions so a leaked/old session can't survive the reset.
 *
 * Invalid/expired/used tokens ALL return the SAME generic `resetTokenInvalid`
 * error — never reveal why, so the response leaks no token/account detail. The
 * route deliberately never reads `applyReset`'s `reason`.
 *
 * REST route handler (not a server action — those 500 on OpenNext/Workers).
 */
export async function POST(request: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "unknown" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";
  const confirm =
    typeof body.confirmPassword === "string" ? body.confirmPassword : "";

  if (!token) {
    return Response.json({ error: "resetTokenInvalid" }, { status: 400 });
  }
  if (!password) {
    return Response.json({ error: "passwordRequired" }, { status: 400 });
  }
  if (!isPasswordLongEnough(password)) {
    return Response.json({ error: "passwordTooShort" }, { status: 400 });
  }
  if (password !== confirm) {
    return Response.json({ error: "passwordMismatch" }, { status: 400 });
  }

  const result = await applyReset(token, password);
  if (!result.ok) {
    // Generic error for notFound/expired/used — no detail leak.
    return Response.json({ error: "resetTokenInvalid" }, { status: 400 });
  }

  return Response.json({ ok: true }, { status: 200 });
}
