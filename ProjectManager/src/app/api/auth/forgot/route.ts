import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { findUserByEmail } from "@/lib/auth/user";
import { normalizeEmail, validateEmail } from "@/lib/auth/validation";
import { sendResetEmail } from "@/lib/mail/send-invite";
import { createPasswordReset } from "@/lib/reset/reset";

type Body = { email?: unknown };

/**
 * REST "forgot password" endpoint.
 *
 * ENUMERATION-SAFE: this ALWAYS returns the same 200 `{ ok: true }` body
 * whether or not the email matches a user. Only when it matches do we mint a
 * reset token and send the email — and a send failure is swallowed (logged in
 * sendResetEmail) so delivery state never leaks account existence either.
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

  const email = normalizeEmail(String(body.email ?? ""));

  // A malformed email is a client error and reveals nothing about accounts.
  const emailError = validateEmail(email);
  if (emailError) {
    return NextResponse.json({ error: emailError }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  if (user) {
    try {
      const reset = await createPasswordReset(user.id);
      const t = await getTranslations("auth.forgot.email");
      await sendResetEmail({
        to: email,
        token: reset.token,
        subject: t("subject"),
        body: (url) => t("body", { url }),
      });
    } catch (err) {
      // NEVER let a mint/send failure change the response — that would leak
      // account existence. Log and fall through to the same success body.
      console.error("[forgot] reset mint/send failed:", err);
    }
  }

  // Same body for hit and miss. The page shows "if an account exists…".
  return NextResponse.json({ ok: true });
}
