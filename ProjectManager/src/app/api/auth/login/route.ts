import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { findUserByEmail } from "@/lib/auth/user";
import {
  normalizeEmail,
  validateEmail,
  type AuthErrorKey,
} from "@/lib/auth/validation";

export type LoginError = AuthErrorKey | "invalidCredentials" | "unknown";

type Body = { email?: unknown; password?: unknown };

/**
 * REST login endpoint (replaces the former server action). Any failure —
 * unknown email or wrong password — returns the same `invalidCredentials` error
 * so the response never reveals whether an email is registered. On success it
 * sets the session cookie and returns `{ ok: true }`; the client redirects.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "unknown" }, { status: 400 });
  }

  const email = normalizeEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");

  const emailError = validateEmail(email);
  if (emailError) {
    return NextResponse.json({ error: emailError }, { status: 400 });
  }
  if (!password) {
    return NextResponse.json({ error: "passwordRequired" }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return NextResponse.json(
      { error: "invalidCredentials" },
      { status: 401 },
    );
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json(
      { error: "invalidCredentials" },
      { status: 401 },
    );
  }

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
