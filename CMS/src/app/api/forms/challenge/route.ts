/**
 * PUBLIC ALTCHA challenge mint for Form-block submissions (form bot
 * protection). The `<altcha-widget>` on a published page fetches one
 * challenge from here, solves it in the browser (PoW), and rides the solved
 * payload into `/api/forms/submit` where it is verified + burned (single use
 * via the login_attempt replay store).
 *
 * Minting is cheap ON PURPOSE: one bounded PBKDF2 derive (ALTCHA_COST
 * iterations) + two HMAC signatures — the asymmetric cost lands on the
 * solver. No rate limit here; a mint costs the server less than the D1 read
 * a limit would take, and unsolved challenges expire in ALTCHA_EXPIRY_MS.
 */
import { createChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  ALTCHA_ALGORITHM,
  ALTCHA_COST,
  altchaCounter,
  altchaExpiresAt,
  altchaSecrets,
} from "@/lib/forms/altcha-core";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { env } = await getCloudflareContext({ async: true });
  const e = env as unknown as Record<string, unknown>;
  const kek = typeof e.CMS_AUTH_SECRET === "string" ? e.CMS_AUTH_SECRET : "";
  const secrets = altchaSecrets(kek);
  const challenge = await createChallenge({
    algorithm: ALTCHA_ALGORITHM,
    cost: ALTCHA_COST,
    counter: altchaCounter(Math.random()),
    deriveKey,
    expiresAt: altchaExpiresAt(Date.now()),
    hmacSignatureSecret: secrets.signature,
    hmacKeySignatureSecret: secrets.key,
  });
  return Response.json(challenge, {
    headers: { "cache-control": "no-store" },
  });
}
