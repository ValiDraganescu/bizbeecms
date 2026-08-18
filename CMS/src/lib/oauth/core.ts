/**
 * PURE OAuth 2.1 authorization-server primitives for this CMS's remote MCP server
 * (cms-mcp → OAuth; a verbatim port of ProjectManager/src/lib/oauth/core.ts). No `@/` imports, no CF bindings — Web Crypto only — so this
 * is node-`--test` loadable. The D1-bound store + route handlers import these.
 *
 * What we implement (the MCP authorization spec, 2025-06-18):
 *   • RFC 9728 protected-resource metadata → points at this AS.
 *   • RFC 8414 AS metadata (authorize / token / register / revoke endpoints).
 *   • RFC 7591 dynamic client registration (public clients, no secret).
 *   • Authorization code + PKCE S256 (mandatory), exact redirect_uri match.
 *   • Bearer access tokens (opaque, hashed at rest) + rotating refresh tokens.
 *   • RFC 8707 `resource` indicator accepted (must be our MCP URL when given).
 */

// ── Lifetimes ────────────────────────────────────────────────────────────────
export const CODE_TTL_MS = 5 * 60 * 1000; // 5 min (spec: short-lived)
export const ACCESS_TTL_MS = 60 * 60 * 1000; // 1 h
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 d

/** The single scope we speak; clients may omit scope entirely. */
export const SCOPE_MCP = "mcp";

// ── Random tokens + hashing (opaque bearer strings, hashed at rest) ──────────
function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 32 crypto-random bytes, base64url, with a type prefix for log/debug clarity. */
export function randomToken(prefix: "code" | "at" | "rt" | "cid"): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return `${prefix}_${b64url(bytes)}`;
}

/** SHA-256 hex of a token — the only form ever persisted or looked up. */
export async function hashToken(token: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Extract a bearer token from an Authorization header (case-insensitive). */
export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^\s*Bearer\s+(\S.*?)\s*$/i.exec(header);
  return m ? m[1] : null;
}

// ── PKCE ─────────────────────────────────────────────────────────────────────
/** base64url(SHA-256(verifier)) — what S256 clients send as code_challenge. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return b64url(new Uint8Array(digest));
}

/** Verifier charset per RFC 7636: 43–128 unreserved chars. */
export function isValidVerifier(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9\-._~]{43,128}$/.test(v);
}

export async function verifyPkce(verifier: unknown, challenge: string): Promise<boolean> {
  if (!isValidVerifier(verifier)) return false;
  return timingSafeEqual(await pkceChallenge(verifier), challenge);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Redirect URIs ────────────────────────────────────────────────────────────
/**
 * A registrable redirect URI: absolute, no fragment, and either https or a
 * loopback http URI (127.0.0.1 / [::1] / localhost — what native clients like
 * Claude Code use for their ephemeral callback server). Custom schemes
 * (`myapp://`) are accepted for native apps too.
 */
export function isAcceptableRedirectUri(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.hash) return false;
  if (u.protocol === "https:") return true;
  if (u.protocol === "http:") {
    const h = u.hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
  }
  // Private-use scheme for native apps (must not be http/https/javascript/data).
  return /^[a-z][a-z0-9+.-]*:$/i.test(u.protocol) && !/^(javascript|data|file|blob):$/i.test(u.protocol);
}

/**
 * Does a presented redirect_uri match a registered one? Exact string match,
 * EXCEPT loopback http URIs may vary the PORT (RFC 8252 §7.3 — native clients
 * bind an ephemeral port per run).
 */
export function redirectUriMatches(registered: string, presented: string): boolean {
  if (registered === presented) return true;
  let r: URL, p: URL;
  try {
    r = new URL(registered);
    p = new URL(presented);
  } catch {
    return false;
  }
  const loop = (u: URL) =>
    u.protocol === "http:" &&
    (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]");
  if (!loop(r) || !loop(p)) return false;
  return r.hostname === p.hostname && r.pathname === p.pathname && r.search === p.search;
}

// ── Dynamic client registration (RFC 7591) ───────────────────────────────────
export type RegistrationRequest = {
  clientName: string;
  redirectUris: string[];
};

/**
 * Validate a registration body. We only issue PUBLIC clients (PKCE is the
 * proof), so `token_endpoint_auth_method` must be `none` (or omitted). Grant /
 * response types, when given, must be within what we support.
 */
export function parseRegistration(
  body: unknown,
): { ok: true; value: RegistrationRequest } | { ok: false; error: string; description: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "invalid_client_metadata", description: "body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 10) {
    return { ok: false, error: "invalid_redirect_uri", description: "redirect_uris must be a non-empty array" };
  }
  for (const u of uris) {
    if (!isAcceptableRedirectUri(u)) {
      return { ok: false, error: "invalid_redirect_uri", description: `unacceptable redirect_uri: ${String(u)}` };
    }
  }
  const auth = b.token_endpoint_auth_method;
  if (auth !== undefined && auth !== "none") {
    return { ok: false, error: "invalid_client_metadata", description: "only public clients (token_endpoint_auth_method=none) are supported" };
  }
  const grants = b.grant_types;
  if (grants !== undefined) {
    if (!Array.isArray(grants) || grants.some((g) => g !== "authorization_code" && g !== "refresh_token")) {
      return { ok: false, error: "invalid_client_metadata", description: "grant_types may only include authorization_code and refresh_token" };
    }
  }
  const responses = b.response_types;
  if (responses !== undefined) {
    if (!Array.isArray(responses) || responses.some((r) => r !== "code")) {
      return { ok: false, error: "invalid_client_metadata", description: "response_types may only include code" };
    }
  }
  const nameRaw = typeof b.client_name === "string" ? b.client_name.trim() : "";
  const clientName = (nameRaw || "MCP client").slice(0, 120);
  return { ok: true, value: { clientName, redirectUris: uris as string[] } };
}

/** The registration response (RFC 7591 §3.2.1) for a freshly stored client. */
export function registrationResponse(client: {
  id: string;
  name: string;
  redirectUris: string[];
  createdAt: number;
}): Record<string, unknown> {
  return {
    client_id: client.id,
    client_id_issued_at: Math.floor(client.createdAt / 1000),
    client_name: client.name,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}

// ── Authorization request ────────────────────────────────────────────────────
export type AuthorizeRequest = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  scope: string;
  resource: string | null;
};

/**
 * Validate the query of GET /oauth/authorize against the registered client.
 * Two failure classes matter (RFC 6749 §4.1.2.1): if client_id/redirect_uri are
 * bad we must NOT redirect (show the error); otherwise errors go back to the
 * client's redirect_uri. `client` is null when the id is unknown.
 */
export function parseAuthorizeRequest(
  params: URLSearchParams,
  client: { id: string; redirectUris: string[] } | null,
  mcpUrl: string,
):
  | { ok: true; value: AuthorizeRequest }
  | { ok: false; redirectable: false; error: string; description: string }
  | { ok: false; redirectable: true; redirectUri: string; state: string | null; error: string; description: string } {
  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const state = params.get("state");
  if (!client || client.id !== clientId) {
    return { ok: false, redirectable: false, error: "invalid_client", description: "unknown client_id" };
  }
  if (!redirectUri || !client.redirectUris.some((r) => redirectUriMatches(r, redirectUri))) {
    return { ok: false, redirectable: false, error: "invalid_request", description: "redirect_uri is not registered for this client" };
  }
  const fail = (error: string, description: string) =>
    ({ ok: false, redirectable: true, redirectUri, state, error, description }) as const;

  if (params.get("response_type") !== "code") {
    return fail("unsupported_response_type", "response_type must be code");
  }
  const codeChallenge = params.get("code_challenge") ?? "";
  if (!/^[A-Za-z0-9\-_]{43}$/.test(codeChallenge)) {
    return fail("invalid_request", "code_challenge (S256, base64url of SHA-256) is required");
  }
  if ((params.get("code_challenge_method") ?? "S256") !== "S256") {
    return fail("invalid_request", "code_challenge_method must be S256");
  }
  const scopeRaw = (params.get("scope") ?? "").trim();
  // Omitted scope → our one scope (RFC 6749 §3.3 lets the AS pick a default).
  const scopes = scopeRaw ? scopeRaw.split(/\s+/) : [SCOPE_MCP];
  if (scopes.some((s) => s !== SCOPE_MCP)) {
    return fail("invalid_scope", `unsupported scope; supported: ${SCOPE_MCP}`);
  }
  const resource = params.get("resource");
  if (resource !== null && !sameResource(resource, mcpUrl)) {
    return fail("invalid_target", `resource must be ${mcpUrl}`);
  }
  return {
    ok: true,
    value: { clientId, redirectUri, codeChallenge, state, scope: scopes.join(" "), resource },
  };
}

/** RFC 8707 resource compare: trailing-slash tolerant, case-insensitive host. */
export function sameResource(a: string, b: string): boolean {
  const norm = (s: string) => {
    try {
      const u = new URL(s);
      u.hash = "";
      return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`;
    } catch {
      return s.replace(/\/+$/, "");
    }
  };
  return norm(a) === norm(b);
}

/** Build the redirect back to the client with either a code or an error. */
export function buildRedirect(
  redirectUri: string,
  params: Record<string, string | null | undefined>,
): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) u.searchParams.set(k, v);
  }
  return u.toString();
}

// ── Token endpoint ───────────────────────────────────────────────────────────
export type TokenRequest =
  | { grant: "authorization_code"; code: string; redirectUri: string; clientId: string; codeVerifier: string; resource: string | null }
  | { grant: "refresh_token"; refreshToken: string; clientId: string | null; scope: string | null; resource: string | null };

/** Parse a token request body (already flattened to a string map). */
export function parseTokenRequest(
  b: Record<string, string>,
): { ok: true; value: TokenRequest } | { ok: false; error: string; description: string } {
  const bad = (error: string, description: string) => ({ ok: false, error, description }) as const;
  switch (b.grant_type) {
    case "authorization_code": {
      if (!b.code) return bad("invalid_request", "code is required");
      if (!b.redirect_uri) return bad("invalid_request", "redirect_uri is required");
      if (!b.client_id) return bad("invalid_client", "client_id is required");
      if (!isValidVerifier(b.code_verifier)) return bad("invalid_request", "code_verifier is required (43–128 chars)");
      return {
        ok: true,
        value: {
          grant: "authorization_code",
          code: b.code,
          redirectUri: b.redirect_uri,
          clientId: b.client_id,
          codeVerifier: b.code_verifier,
          resource: b.resource ?? null,
        },
      };
    }
    case "refresh_token":
      if (!b.refresh_token) return bad("invalid_request", "refresh_token is required");
      return {
        ok: true,
        value: {
          grant: "refresh_token",
          refreshToken: b.refresh_token,
          clientId: b.client_id ?? null,
          scope: b.scope ?? null,
          resource: b.resource ?? null,
        },
      };
    default:
      return bad("unsupported_grant_type", "grant_type must be authorization_code or refresh_token");
  }
}

/** The RFC 6749 §5.1 success payload. */
export function tokenResponse(t: {
  accessToken: string;
  refreshToken: string;
  scope: string;
  accessTtlMs?: number;
}): Record<string, unknown> {
  return {
    access_token: t.accessToken,
    token_type: "Bearer",
    expires_in: Math.floor((t.accessTtlMs ?? ACCESS_TTL_MS) / 1000),
    refresh_token: t.refreshToken,
    scope: t.scope,
  };
}

// ── Discovery metadata ───────────────────────────────────────────────────────
/** RFC 8414 authorization-server metadata for `issuer` (our origin). */
export function authorizationServerMetadata(issuer: string): Record<string, unknown> {
  const o = issuer.replace(/\/+$/, "");
  return {
    issuer: o,
    authorization_endpoint: `${o}/oauth/authorize`,
    token_endpoint: `${o}/oauth/token`,
    registration_endpoint: `${o}/oauth/register`,
    revocation_endpoint: `${o}/oauth/revoke`,
    scopes_supported: [SCOPE_MCP],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    service_documentation: `${o}/settings/connections`,
  };
}

/** RFC 9728 protected-resource metadata for the MCP endpoint. */
export function protectedResourceMetadata(issuer: string): Record<string, unknown> {
  const o = issuer.replace(/\/+$/, "");
  return {
    resource: `${o}/mcp`,
    authorization_servers: [o],
    scopes_supported: [SCOPE_MCP],
    bearer_methods_supported: ["header"],
    resource_name: "bizbeecms site MCP",
  };
}

/** The 401 challenge that tells an MCP client where to discover the AS. */
export function wwwAuthenticate(issuer: string, error?: string, description?: string): string {
  const o = issuer.replace(/\/+$/, "");
  const parts = [`Bearer resource_metadata="${o}/.well-known/oauth-protected-resource/mcp"`];
  if (error) parts.push(`error="${error}"`);
  if (description) parts.push(`error_description="${description.replace(/"/g, "'")}"`);
  return parts.join(", ");
}

/**
 * The public origin (issuer) to advertise: the deployer-injected `APP_ORIGIN`
 * (this Site's custom domain when attached, else its workers.dev URL) in
 * production; the request host in local dev. Same choice as `chooseMcpUrl`. Trailing slashes stripped.
 */
export function chooseIssuer(
  appOrigin: string | undefined | null,
  requestHost: string | undefined | null,
  proto: string | undefined | null,
): string {
  const configured = (appOrigin ?? "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (requestHost) return `${proto ?? "https"}://${requestHost}`;
  return "https://<your-site>.workers.dev";
}
