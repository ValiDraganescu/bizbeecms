import { headers } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Invite email sender — Cloudflare-native seam.
 *
 * Cloudflare Email Sending (Beta, Workers Paid) exposes a `send_email` binding
 * as `env.EMAIL.send()`. When that binding is configured we send through it.
 * In environments without it (local dev, or before the binding/verified sender
 * is provisioned), we degrade gracefully: log the link server-side and report
 * `delivered: false` so the UI can surface the accept link for manual sharing.
 *
 * TODO(deploy): declare the `send_email` binding in wrangler.jsonc (currently a
 * commented placeholder — needs a verified sender/destination on a Paid plan)
 * and regenerate cloudflare-env.d.ts so `env.EMAIL` is typed. Also set the
 * `APP_ORIGIN` var (see buildAcceptUrl) so invite links use a trusted origin.
 */

// Minimal shape of the Cloudflare send_email binding we rely on. Kept local
// because cloudflare-env.d.ts doesn't type EMAIL until the binding is added.
type EmailMessage = {
  from: string;
  to: string;
  subject: string;
  text: string;
};
type EmailBinding = { send: (message: EmailMessage) => Promise<void> };

const FROM_ADDRESS = "noreply@bizbeecms.com";

export type SendInviteResult = {
  /** Absolute URL the invitee opens to accept. Always returned. */
  acceptUrl: string;
  /** Whether a real email was dispatched (vs. logged for manual sharing). */
  delivered: boolean;
};

/**
 * Build the absolute accept-invite URL.
 *
 * SECURITY: the origin must come from trusted configuration, NOT the request's
 * Host / X-Forwarded-Proto headers — those are client-controllable, so deriving
 * the link from them is Host Header Injection (an attacker could mint an invite
 * whose emailed link points at a malicious origin). We use the `APP_ORIGIN`
 * Cloudflare var/secret. Only in local development do we fall back to the
 * request host (there it isn't a trust boundary, and it keeps dev frictionless).
 */
async function buildAcceptUrl(
  env: Record<string, unknown>,
  token: string,
): Promise<string> {
  const configured = typeof env.APP_ORIGIN === "string" ? env.APP_ORIGIN : "";
  if (configured) {
    return `${configured.replace(/\/+$/, "")}/invite/accept/${token}`;
  }

  // No trusted origin configured. Allow the request host ONLY in development.
  if (process.env.NODE_ENV !== "production") {
    const h = await headers();
    const host = h.get("host") ?? "localhost:3601";
    const proto = h.get("x-forwarded-proto") ?? "http";
    return `${proto}://${host}/invite/accept/${token}`;
  }

  // In production we refuse to guess the origin from headers.
  throw new Error(
    "APP_ORIGIN is not configured; cannot build a trusted invite link.",
  );
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
  const email = (env as unknown as { EMAIL?: EmailBinding }).EMAIL;

  if (!email) {
    // No binding (dev / not yet provisioned): degrade to log + show in-app.
    console.log(`[invite] no EMAIL binding; accept link for ${params.to}: ${acceptUrl}`);
    return { acceptUrl, delivered: false };
  }

  try {
    await email.send({
      from: FROM_ADDRESS,
      to: params.to,
      subject: params.subject,
      text: params.body(acceptUrl),
    });
    return { acceptUrl, delivered: true };
  } catch (err) {
    // Don't fail the invite if delivery fails — the link still works and the
    // UI can show it. Surface the failure in logs.
    console.error(`[invite] EMAIL.send failed for ${params.to}:`, err);
    return { acceptUrl, delivered: false };
  }
}
