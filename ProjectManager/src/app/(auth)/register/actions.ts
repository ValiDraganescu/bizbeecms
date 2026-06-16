"use server";

import { redirect } from "next/navigation";
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

export type RegisterState = {
  error?: AuthErrorKey | "registrationClosed" | "emailTaken" | "unknown";
  /** Preserve the typed email across a failed submit. */
  email?: string;
};

/**
 * Register the FIRST user as SuperAdmin. Self-registration is open only while
 * the users table is empty; once any user exists, the route is closed and new
 * users arrive through the invite flow. The empty-table check and the insert
 * run back-to-back so the first successful registrant claims SuperAdmin.
 */
export async function registerAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  // Hard gate: only the very first user may self-register.
  if (await hasAnyUser()) {
    return { error: "registrationClosed" };
  }

  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  const emailError = validateEmail(email);
  if (emailError) return { error: emailError, email };

  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError, email };

  if (password !== confirm) return { error: "passwordMismatch", email };

  // Re-check inside the action right before insert (table may have filled
  // between the gate above and now); the email unique index is the backstop.
  if (await userCount() > 0) return { error: "registrationClosed" };
  if (await findUserByEmail(email)) return { error: "emailTaken", email };

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
    return { error: "emailTaken", email };
  }

  await createSession(userId);
  redirect("/");
}
