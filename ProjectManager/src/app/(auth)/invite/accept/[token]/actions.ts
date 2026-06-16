"use server";

import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth/session";
import { validatePassword } from "@/lib/auth/validation";
import { acceptInvite, type InviteStatus } from "@/lib/invite/invite";

export type AcceptState = {
  error?:
    | "passwordRequired"
    | "passwordTooShort"
    | "passwordMismatch"
    | InviteStatus
    | "emailTaken"
    | "unknown";
};

/**
 * Accept an invite: validate the password, create the user from the invite's
 * role/country, mark the invite used, and start a session. The token comes from
 * the route (bound here) — the invitee never chooses their role/email/country.
 */
export async function acceptInviteAction(
  token: string,
  _prev: AcceptState,
  formData: FormData,
): Promise<AcceptState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };
  if (password !== confirm) return { error: "passwordMismatch" };

  const result = await acceptInvite(token, password);
  if (!result.ok) return { error: result.reason };

  await createSession(result.user.id);
  redirect("/");
}
