import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import {
  createUser,
  findUserByEmail,
  hasAnyUser,
  userCount,
} from "@/lib/auth/user";
import {
  normalizeEmail,
  validateEmail,
  validatePassword,
  type AuthErrorKey,
} from "@/lib/auth/validation";

export type RegisterError =
  | AuthErrorKey
  | "registrationClosed"
  | "emailTaken"
  | "unknown";

/** JSON body the register form POSTs. */
type Body = { email?: unknown; password?: unknown; confirmPassword?: unknown };

/**
 * REST register endpoint (replaces the former server action — server actions
 * 500 on OpenNext/Workers). Registers the FIRST user as SuperAdmin; once any
 * user exists the route is closed and further users arrive via invite. On
 * success it sets the session cookie and returns `{ ok: true }`; the client
 * redirects. On a validation/business failure it returns `{ error }` with the
 * same stable keys the UI resolves against `auth.errors.*`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  // Hard gate: only the very first user may self-register.
  if (await hasAnyUser()) {
    return NextResponse.json({ error: "registrationClosed" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "unknown" }, { status: 400 });
  }

  const email = normalizeEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");
  const confirm = String(body.confirmPassword ?? "");

  const emailError = validateEmail(email);
  if (emailError) {
    return NextResponse.json({ error: emailError }, { status: 400 });
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }
  if (password !== confirm) {
    return NextResponse.json({ error: "passwordMismatch" }, { status: 400 });
  }

  // Re-check right before insert (table may have filled); unique index backstops.
  if ((await userCount()) > 0) {
    return NextResponse.json({ error: "registrationClosed" }, { status: 403 });
  }
  if (await findUserByEmail(email)) {
    return NextResponse.json({ error: "emailTaken" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  let userId: string;
  try {
    const user = await createUser({
      email,
      passwordHash,
      role: "SuperAdmin",
      canInvite: true,
    });
    userId = user.id;
  } catch {
    // Most likely the unique-email constraint lost a race.
    return NextResponse.json({ error: "emailTaken" }, { status: 409 });
  }

  await createSession(userId);
  return NextResponse.json({ ok: true });
}
