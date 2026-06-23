/**
 * Per-Site Google OAuth client config — PURE helpers (cms-auth GOOGLE-CLIENT
 * REWORK, storage slice). No `@/` imports, no CF bindings → node-testable.
 *
 * The customer registers their OWN Google OAuth 2.0 client and stores its
 * credentials in the CMS settings; they're persisted in the CMS's own D1 (client
 * id plaintext, client secret encrypted via secret-box). These helpers normalize
 * what the operator typed and decide whether a Site is "configured" — the signal
 * that gates the login-page Google button (a later slice) and the OAuth routes.
 *
 * "Configured" = BOTH a non-empty client id AND a non-empty (encrypted) secret.
 * A Site with neither (or only one) hides the button entirely (no shared
 * fallback — REWORK decision 2).
 */

/** What's persisted in the `site_settings` `google_client` row (secret encrypted). */
export interface GoogleClientConfig {
  /** Google OAuth client id (e.g. "1234-abc.apps.googleusercontent.com"). Plaintext. */
  clientId: string;
  /** AES-GCM blob of the client secret (secret-box wire format). Empty = unset. */
  clientSecretEnc: string;
}

/** The empty/unset config — the safe default when no row exists / row is garbage. */
export function emptyGoogleClientConfig(): GoogleClientConfig {
  return { clientId: "", clientSecretEnc: "" };
}

/** True when the operator typed a plausible Google client id (loose; Google validates). */
export function isValidClientId(id: unknown): boolean {
  return typeof id === "string" && id.trim().length > 0 && id.trim().length <= 256;
}

/** True when the operator typed a plausible client secret (loose length bound). */
export function isValidClientSecret(secret: unknown): boolean {
  return (
    typeof secret === "string" && secret.trim().length > 0 && secret.trim().length <= 512
  );
}

/**
 * Is this Site's Google client fully configured? Needs BOTH an id and an
 * encrypted secret — a half-filled config is treated as not configured (button
 * hidden, routes no-op). Tolerates an `unknown` (e.g. a defensively-parsed row).
 */
export function isGoogleConfigured(config: unknown): boolean {
  if (!config || typeof config !== "object") return false;
  const c = config as Partial<GoogleClientConfig>;
  return (
    typeof c.clientId === "string" &&
    c.clientId.trim().length > 0 &&
    typeof c.clientSecretEnc === "string" &&
    c.clientSecretEnc.length > 0
  );
}

/**
 * Normalize a raw (possibly-bad-JSON) stored value into a GoogleClientConfig.
 * Trims the id; keeps the encrypted secret verbatim (it's a base64 blob). Any
 * non-string field → empty. Never throws.
 */
export function normalizeGoogleClientConfig(raw: unknown): GoogleClientConfig {
  if (!raw || typeof raw !== "object") return emptyGoogleClientConfig();
  const r = raw as Partial<GoogleClientConfig>;
  return {
    clientId: typeof r.clientId === "string" ? r.clientId.trim() : "",
    clientSecretEnc: typeof r.clientSecretEnc === "string" ? r.clientSecretEnc : "",
  };
}

/** The non-secret view returned to the admin UI — NEVER echoes the secret blob. */
export interface GoogleClientStatus {
  /** The client id (safe to show — it's not a secret). */
  clientId: string;
  /** Whether a client secret is stored (true) without revealing it. */
  hasSecret: boolean;
  /** Convenience: fully configured (id + secret). Drives the button visibility. */
  configured: boolean;
}

/** Project a stored config to the safe status view for the UI. */
export function toGoogleClientStatus(config: GoogleClientConfig): GoogleClientStatus {
  return {
    clientId: config.clientId,
    hasSecret: config.clientSecretEnc.length > 0,
    configured: isGoogleConfigured(config),
  };
}

/**
 * The OAuth routes' runtime decision: given the stored per-Site config (id +
 * encrypted secret presence) and the deployer-injected `appOrigin`, is Google
 * sign-in usable, and what redirect_uri do start/callback share?
 *
 * `usable` requires a configured client (id + secret) AND an `appOrigin` — the
 * redirect_uri is always `<appOrigin>/api/auth/google/callback` (the customer
 * registers exactly that URI). Not usable → the route no-ops (start redirects to
 * /admin, no consent). The actual secret is decrypted at request time by the
 * store (`getDecryptedClientSecret`); this helper only needs to know it EXISTS.
 */
export interface GoogleRouteDecision {
  usable: boolean;
  clientId: string;
  redirectUri: string;
}

export function decideGoogleRoute(
  config: GoogleClientConfig,
  appOrigin: string,
): GoogleRouteDecision {
  const origin = typeof appOrigin === "string" ? appOrigin.replace(/\/+$/, "") : "";
  const usable = isGoogleConfigured(config) && origin.length > 0;
  return {
    usable,
    clientId: config.clientId,
    redirectUri: origin ? `${origin}/api/auth/google/callback` : "",
  };
}
