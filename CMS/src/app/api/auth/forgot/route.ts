import { getTranslations } from "next-intl/server";
import { findUserByEmail, normalizeEmail } from "@/db/user-store";
import { sendResetEmail } from "@/lib/mail/send-invite";
import { createPasswordReset } from "@/lib/reset/reset";
import {
  recentFailureTimestamps,
  recordFailure,
} from "@/db/login-attempt-store";
import { decideThrottle } from "@/lib/auth/throttle-core";

type Body = { email?: unknown };

/**
 * CMS "forgot password" endpoint (auth-reset C2; mirrors PM P2).
 *
 * ENUMERATION-SAFE: this ALWAYS returns the same 200 `{ ok: true }` body
 * whether or not the email matches a user. Only when it matches do we mint a
 * reset token and send the email — and a mint/send failure is swallowed so
 * delivery state never leaks account existence either.
 *
 * RATE-LIMITED (cms-auth): reset-email requests are throttled per-email over the
 * SAME sliding window as login, but in the SEPARATE `kind:"forgot"` namespace
 * (so spamming this endpoint can't lock out login). Every request counts (there
 * is no "success" to clear on — the response is always 200); once the limit is
 * hit the request is rejected with 429 + `Retry-After` BEFORE any DB lookup or
 * email send, which also stops reset-email flooding of a victim's inbox.
 * Non-enumerating: the attempt is recorded for unknown emails too, so a 429
 * never reveals whether an account exists.
 *
 * REST route handler (not a server action — those 500 on OpenNext/Workers).
 */
export async function POST(request: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "badRequest" }, { status: 400 });
  }

  const email = normalizeEmail(typeof body.email === "string" ? body.email : "");

  // A malformed email is a client error and reveals nothing about accounts.
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return Response.json({ error: "badRequest" }, { status: 400 });
  }

  // Throttle BEFORE the user lookup / email send.
  const now = Date.now();
  const throttle = decideThrottle(
    await recentFailureTimestamps(email, now, "forgot"),
    now,
  );
  if (throttle.locked) {
    const retryAfter = Math.ceil(throttle.retryAfterMs / 1000);
    return Response.json(
      { error: "tooManyAttempts" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }
  // Every request (hit or miss) counts toward the window — there's no success
  // signal to clear on, and counting misses too keeps it non-enumerating.
  await recordFailure(email, now, "forgot");

  const user = await findUserByEmail(email);
  if (user) {
    try {
      const reset = await createPasswordReset(user.id);
      const t = await getTranslations("resetEmail");
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
  return Response.json({ ok: true });
}
