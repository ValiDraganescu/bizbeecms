import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  GOOGLE_JWKS_URI,
  GOOGLE_TOKEN_ENDPOINT,
  decideGoogleSignIn,
  verifiedEmailFromIdToken,
  verifyIdTokenSignature,
  verifyState,
  type GoogleJwk,
} from "@/lib/auth/google-core";
import { createSession } from "@/db/session-store";
import { findUserByEmail } from "@/db/user-store";
import { hasPendingInvite } from "@/db/invite-store";
import { decideGoogleRoute } from "@/lib/auth/google-config";
import {
  getGoogleClientConfig,
  getDecryptedClientSecret,
} from "@/db/google-client-store";

/**
 * Google sign-in CALLBACK (cms-auth Slice 2b). Google redirects the browser here
 * with `?code=…&state=…`. We:
 *   1. verify the signed `state` (CSRF — must match what start issued, unexpired),
 *   2. exchange the `code` at Google's token endpoint (server-to-server, holds
 *      the client_secret) for an id_token,
 *   3. extract the VERIFIED email from the id_token (aud === our client, Google
 *      issuer, email_verified === true),
 *   4. allow sign-in ONLY if that email matches a CMS user OR a pending invite —
 *      NO self-signup (Slice-0 decision 3; randoms can't walk in). A pending
 *      invite is consumed by upgrading it: we mint a session for the matched user
 *      if one exists; an invited-but-not-yet-a-user email is sent to the invite
 *      accept flow to finish (it has no password yet). For the simple case we
 *      sign in an EXISTING user; an invited-only email is redirected to /admin
 *      with a hint so the invite-accept page can complete (keeps one user-creation
 *      path — the invite flow).
 *   5. mint the same `bizbee_session` CMS-local session (one session notion).
 *
 * Fail-closed: bad state, failed exchange, unverified email, or an uninvited
 * email → redirect to /admin with an `?error=` the login page surfaces. The
 * redirect_uri MUST match start's (APP_ORIGIN-based) or Google rejects the
 * exchange.
 *
 * REST route handler, not a server action (server actions 500 on OpenNext).
 */
function redirect(to: string): Response {
  return new Response(null, { status: 302, headers: { location: to } });
}

// Google's JWKS rotates infrequently; cache it in-Worker so we don't refetch on
// every sign-in. ponytail: module-level cache, fine for a single key set per
// Worker instance; add an ETag/max-age refresh only if rotation ever bites.
let jwksCache: { keys: GoogleJwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 1000 * 60 * 60; // 1h

async function fetchGoogleJwks(): Promise<{ keys: GoogleJwk[] } | null> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return { keys: jwksCache.keys };
  }
  try {
    const res = await fetch(GOOGLE_JWKS_URI);
    if (res.status !== 200) return null;
    const body = (await res.json()) as { keys?: GoogleJwk[] };
    if (!body || !Array.isArray(body.keys)) return null;
    jwksCache = { keys: body.keys, fetchedAt: Date.now() };
    return { keys: body.keys };
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";

  const { env } = await getCloudflareContext({ async: true });
  const e = env as unknown as Record<string, unknown>;
  const cmsSecret = typeof e.CMS_AUTH_SECRET === "string" ? e.CMS_AUTH_SECRET : "";
  const appOrigin = typeof e.APP_ORIGIN === "string" ? e.APP_ORIGIN : "";

  // Per-Site Google client creds from the CMS's own D1 (NOT shared env vars).
  // clientId is plaintext; the secret is decrypted at request time with the KEK.
  // A decrypt failure returns null → treated as not-configured, NEVER a 500.
  const config = await getGoogleClientConfig();
  const route = decideGoogleRoute(config, appOrigin);
  const clientId = route.clientId;
  const clientSecret = cmsSecret ? await getDecryptedClientSecret(cmsSecret) : null;

  if (!code || !state || !route.usable || !clientSecret || !cmsSecret) {
    return redirect("/admin?error=google");
  }

  // 1. CSRF: the state must be one we signed and not expired.
  if (!(await verifyState(state, cmsSecret))) {
    return redirect("/admin?error=google");
  }

  // 2. Exchange the code for tokens (server-to-server; client_secret never leaves
  //    the Worker). redirect_uri MUST equal the one start sent.
  const redirectUri = route.redirectUri;
  let idToken = "";
  try {
    const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });
    const body = (await res.json().catch(() => null)) as { id_token?: unknown } | null;
    if (res.status === 200 && body && typeof body.id_token === "string") {
      idToken = body.id_token;
    }
  } catch {
    idToken = "";
  }
  if (!idToken) return redirect("/admin?error=google");

  // 3. Verify the id_token's RS256 signature against Google's JWKS (defense in
  //    depth on top of the TLS-authenticated direct exchange). Fail-closed: a
  //    JWKS we can't fetch, or a signature that doesn't match, rejects sign-in.
  const jwks = await fetchGoogleJwks();
  if (!jwks || !(await verifyIdTokenSignature(idToken, jwks))) {
    return redirect("/admin?error=google");
  }

  // 4. Verified email from the id_token (claims: aud/iss/email_verified/exp).
  const email = verifiedEmailFromIdToken(idToken, clientId);

  // 5. Resolve existence (user / pending invite) and apply the no-self-signup rule.
  const user = email ? await findUserByEmail(email) : null;
  const pendingInvite = email && !user ? await hasPendingInvite(email) : false;
  const decision = decideGoogleSignIn(email, { user: user != null, pendingInvite });
  if (!decision.ok) {
    return redirect(`/admin?error=${decision.reason === "notInvited" ? "googleDenied" : "google"}`);
  }

  // An invited-but-not-yet-a-user email: finish via the invite-accept flow (it has
  // no CMS user / password yet). Existing users sign in directly.
  if (!user) {
    // Pending invite only → they still need to accept (sets up their account).
    return redirect("/admin?error=googleInvitePending");
  }

  // 6. Mint the CMS-local session (sets the bizbee_session cookie).
  await createSession(user.id);
  return redirect("/admin");
}
