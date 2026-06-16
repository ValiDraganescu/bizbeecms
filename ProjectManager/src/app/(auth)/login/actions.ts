"use server";

import { redirect } from "next/navigation";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { findUserByEmail } from "@/lib/auth/user";
import {
  normalizeEmail,
  validateEmail,
  type AuthErrorKey,
} from "@/lib/auth/validation";

export type LoginState = {
  error?: AuthErrorKey | "invalidCredentials" | "unknown";
  email?: string;
};

/**
 * Authenticate an existing user. On any failure (unknown email or wrong
 * password) we return the same `invalidCredentials` error so the form does not
 * reveal whether an email is registered.
 */
export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");

  const emailError = validateEmail(email);
  if (emailError) return { error: emailError, email };
  if (!password) return { error: "passwordRequired", email };

  const user = await findUserByEmail(email);
  // Verify even when the user is missing? We skip the hash work but keep the
  // generic error to avoid leaking account existence via the response shape.
  if (!user) return { error: "invalidCredentials", email };

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return { error: "invalidCredentials", email };

  await createSession(user.id);
  redirect("/");
}
