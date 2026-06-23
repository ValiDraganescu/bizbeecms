/**
 * CMS invite-email sender (cms-auth Slice 4) — Cloudflare-native seam.
 *
 * Cloudflare Email Sending exposes a `send_email` binding as `env.EMAIL.send()`.
 * When that binding is configured we send through it. Without it (local dev, or
 * before the binding + a verified sender domain is provisioned) we degrade
 * gracefully: log the accept link server-side and report `delivered: false` so
 * the UI can surface the link for manual sharing — exactly like PM.
 *
 * Wiring TODO (deploy): the `send_email` binding is declared (commented) in
 * `wrangler.jsonc`; enabling a real send needs a verified sender domain
 * (`wrangler email sending enable <domain>`) on a Paid plan, then uncomment the
 * binding + regen `cloudflare-env.d.ts` so `env.EMAIL` is typed. The accept link
 * origin comes from the `APP_ORIGIN` Worker var (deployer-injected per-Site).
 */
import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Workers `send_email` binding shape (per the cloudflare-email-service skill).
// Kept local because cloudflare-env.d.ts doesn't type EMAIL until the binding is
// uncommented + typegen reruns.
type EmailMessage = {
  to: string;
  from: { email: string; name?: string };
  subject: string;
  text: string;
  html?: string;
};
type EmailBinding = { send: (message: EmailMessage) => Promise<unknown> };

const FROM_ADDRESS = "noreply@bizbeecms.com";
const FROM_NAME = "BizbeeCMS";

export type SendInviteResult = {
  /** Absolute URL the invitee opens to accept. Always returned. */
  acceptUrl: string;
  /** Whether a real email was dispatched (vs. logged for manual sharing). */
  delivered: boolean;
};

/**
 * Build the absolute accept-invite URL.
 *
 * SECURITY: the origin must come from trusted config, NOT the request Host /
 * X-Forwarded-* headers (client-controllable → Host Header Injection — an
 * attacker could mint an invite whose link points at a malicious origin). We use
 * the `APP_ORIGIN` Worker var. Only in local dev do we fall back to the request
 * host (there it isn't a trust boundary, and it keeps dev frictionless).
 */
async function buildUrl(
  env: Record<string, unknown>,
  path: string,
): Promise<string> {
  const configured = typeof env.APP_ORIGIN === "string" ? env.APP_ORIGIN : "";
  if (configured) {
    return `${configured.replace(/\/+$/, "")}${path}`;
  }

  if (process.env.NODE_ENV !== "production") {
    const h = await headers();
    const host = h.get("host") ?? "localhost:3601";
    const proto = h.get("x-forwarded-proto") ?? "http";
    return `${proto}://${host}${path}`;
  }

  throw new Error(
    "APP_ORIGIN is not configured; cannot build a trusted link.",
  );
}

async function buildAcceptUrl(
  env: Record<string, unknown>,
  token: string,
): Promise<string> {
  return buildUrl(env, `/invite/accept/${token}`);
}

export async function sendInviteEmail(params: {
  to: string;
  token: string;
  subject: string;
  body: (acceptUrl: string) => string;
}): Promise<SendInviteResult> {
  const { env } = await getCloudflareContext({ async: true });
  const acceptUrl = await buildAcceptUrl(
    env as unknown as Record<string, unknown>,
    params.token,
  );
  const email = (env as { EMAIL?: EmailBinding }).EMAIL;

  if (!email) {
    // No binding (dev / not yet provisioned): degrade to log + show in-app link.
    console.log(`[invite] no EMAIL binding; accept link for ${params.to}: ${acceptUrl}`);
    return { acceptUrl, delivered: false };
  }

  try {
    await email.send({
      to: params.to,
      from: { email: FROM_ADDRESS, name: FROM_NAME },
      subject: params.subject,
      text: params.body(acceptUrl),
    });
    return { acceptUrl, delivered: true };
  } catch (err) {
    // Don't fail the invite if delivery fails — the link still works and the UI
    // can show it. Surface the failure in logs.
    console.error(`[invite] EMAIL.send failed for ${params.to}:`, err);
    return { acceptUrl, delivered: false };
  }
}

export type SendResetResult = {
  /** Absolute URL the user opens to set a new password. */
  resetUrl: string;
  /** Whether a real email was dispatched (vs. logged for manual sharing). */
  delivered: boolean;
};

/**
 * Send a password-reset email (auth-reset C2). Mirrors `sendInviteEmail`:
 * builds the `/reset/<token>` link from the trusted `APP_ORIGIN` var and sends
 * via the `EMAIL` binding, degrading gracefully (log + `delivered:false`) when
 * the binding is absent or `send()` throws. The caller (the forgot route) is
 * enumeration-safe and never surfaces `delivered` to the requester.
 */
export async function sendResetEmail(params: {
  to: string;
  token: string;
  subject: string;
  body: (resetUrl: string) => string;
}): Promise<SendResetResult> {
  const { env } = await getCloudflareContext({ async: true });
  const resetUrl = await buildUrl(
    env as unknown as Record<string, unknown>,
    `/reset/${params.token}`,
  );
  const email = (env as { EMAIL?: EmailBinding }).EMAIL;

  if (!email) {
    console.log(`[reset] no EMAIL binding; reset link for ${params.to}: ${resetUrl}`);
    return { resetUrl, delivered: false };
  }

  try {
    await email.send({
      to: params.to,
      from: { email: FROM_ADDRESS, name: FROM_NAME },
      subject: params.subject,
      text: params.body(resetUrl),
    });
    return { resetUrl, delivered: true };
  } catch (err) {
    console.error(`[reset] EMAIL.send failed for ${params.to}:`, err);
    return { resetUrl, delivered: false };
  }
}
