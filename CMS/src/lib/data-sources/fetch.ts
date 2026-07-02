/**
 * external-data-sources Slice 2 — the CENTRALIZED request layer (USER DIRECTIVE
 * 2026-07-02): ALL outbound external-API calls go through this one module. Auth
 * injection, `{placeholder}` substitution, retries, caching and (later) purging
 * live HERE, nowhere else.
 *
 * Pure module: NO `@/` imports, NO React/drizzle/CF bindings — node-testable
 * (scripts/data-source-fetch.test.mjs). All effects are injected (`fetch`,
 * `sleep`, `cache`), so tests cover retry counts, encoding and cache-key
 * stability without a live API.
 *
 * Trust boundaries:
 * - `params` come from component props / inputs — UNTRUSTED. Values are
 *   URL-encoded (path), URLSearchParams-encoded (query) or JSON-escaped (body)
 *   on insert; never raw-spliced.
 * - `source.secret` is the DECRYPTED secret (caller uses
 *   `decryptSourceSecret`) — server-side only, never reaches the browser.
 *
 * Policy (GOAL.md 2026-07-02 revision):
 * - Retries: ≤2 retries (3 attempts) on network error / 5xx / 429, small
 *   backoff; NEVER on other 4xx; only for GET or `request.retryable === true`
 *   (a POST that creates things must not double-fire).
 * - Cache: only when `cacheEnabled` AND (GET or explicitly retryable-safe),
 *   TTL per request. Key embeds a version + the sourceId so Slice-7 purge can
 *   evict per-source or globally by bumping a version instead of enumerating.
 */
import type { AuthType, HttpMethod } from "./validate.ts";

export type FetchSourceConfig = {
  id: string;
  baseUrl: string;
  authType: AuthType;
  /**
   * Header name / query key the secret rides in (header/query auth);
   * the TOKEN URL for oauth2 client-credentials.
   */
  authParam: string | null;
  /**
   * DECRYPTED secret; for basic auth the stored secret is "user:password",
   * for oauth2 it is "client_id:client_secret".
   */
  secret: string | null;
};

export type FetchRequestConfig = {
  id: string;
  method: HttpMethod;
  path: string;
  query: Record<string, string>;
  bodyTemplate: string | null;
  cacheEnabled: boolean;
  cacheTtlSec: number;
  retryable: boolean;
};

/** Values a component prop/input may feed into a `{placeholder}`. */
export type RequestParams = Record<string, string | number | boolean>;

/** Minimal cache port — Slice 3 wires a Workers-backed impl (KV / Cache API). */
export type ApiCache = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, ttlSec: number): Promise<void>;
};

export type FetchDeps = {
  fetch?: typeof fetch;
  cache?: ApiCache | null;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  /** Slice-7 purge hook: bump to invalidate all cached entries. */
  cacheVersion?: string;
};

export type FetchSourceResult =
  | { ok: true; status: number; data: unknown; cached: boolean }
  | { ok: false; status: number | null; error: string };

const MAX_ATTEMPTS = 3; // 1 try + 2 retries (USER DIRECTIVE)
const BACKOFF_MS = 200;
const DEFAULT_TIMEOUT_MS = 10_000;
/**
 * Hard cap on the upstream response body. Without it, `res.json()` buffers an
 * unbounded body into Worker memory (128 MB isolate limit) AND the parsed blob
 * gets re-stringified into the cache. Checked twice: content-length header
 * (cheap pre-read reject) and a STREAMING byte count (header may be absent —
 * a chunked body must be aborted mid-stream, not buffered then measured).
 */
const MAX_RESPONSE_BYTES = 5_000_000;
const MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const PLACEHOLDER_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

/* --------------------------------------------------------- substitution */

type Sub = { ok: true; value: string } | { ok: false; error: string };

/** Replace each `{name}` via `encode(params[name])`; missing param = error. */
function substitute(
  template: string,
  params: RequestParams,
  encode: (v: string) => string,
): Sub {
  let missing: string | null = null;
  const value = template.replace(PLACEHOLDER_RE, (_, name: string) => {
    if (!(name in params)) {
      missing = missing ?? name;
      return "";
    }
    return encode(String(params[name]));
  });
  if (missing) return { ok: false, error: `missing param "${missing}"` };
  return { ok: true, value };
}

/** JSON string-escape (no surrounding quotes) — safe insert into a JSON body. */
function jsonEscape(v: string): string {
  return JSON.stringify(v).slice(1, -1);
}

/* ------------------------------------------------------------ building */

export type BuiltRequest = {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body: string | null;
};

/**
 * Resolve source + saved request + params into a concrete HTTP request:
 * URL (baseUrl + path + merged query), auth applied, body substituted.
 * Never throws; malformed input → { ok: false }.
 */
export function buildRequest(
  source: FetchSourceConfig,
  request: FetchRequestConfig,
  params: RequestParams = {},
): { ok: true; value: BuiltRequest } | { ok: false; error: string } {
  // Path: URL-encode each substituted value so "São Paulo" can't break the URL.
  const path = substitute(request.path, params, encodeURIComponent);
  if (!path.ok) return path;

  let url: URL;
  try {
    const base = source.baseUrl.replace(/\/+$/, "");
    const p = path.value === "" ? "" : path.value.startsWith("/") ? path.value : `/${path.value}`;
    url = new URL(base + p);
  } catch {
    return { ok: false, error: "could not build request URL" };
  }

  // Query: substitute raw (URLSearchParams encodes on serialization).
  for (const [k, tpl] of Object.entries(request.query)) {
    const v = substitute(tpl, params, (s) => s);
    if (!v.ok) return v;
    url.searchParams.set(k, v.value);
  }

  const headers: Record<string, string> = { accept: "application/json" };

  // Auth — the only place a secret touches a request. (oauth2 is the one
  // exception: its Bearer token is minted async in fetchSource and injected
  // into these headers there — buildRequest stays sync and pure.)
  if (source.secret) {
    if (source.authType === "header" && source.authParam) {
      headers[source.authParam] = source.secret;
    } else if (source.authType === "query" && source.authParam) {
      url.searchParams.set(source.authParam, source.secret);
    } else if (source.authType === "basic") {
      headers["authorization"] = `Basic ${btoa(source.secret)}`;
    }
  }

  // Body: JSON-escape substituted values so quotes can't break out of strings.
  let body: string | null = null;
  if (request.bodyTemplate && request.method !== "GET") {
    const b = substitute(request.bodyTemplate, params, jsonEscape);
    if (!b.ok) return b;
    body = b.value;
    headers["content-type"] = "application/json";
  }

  return { ok: true, value: { url: url.toString(), method: request.method, headers, body } };
}

/* -------------------------------------------------------------- caching */

// ponytail: FNV-1a 32-bit — non-cryptographic, collisions just cause a rare
// stale/extra fetch, never a correctness break. Upgrade to SHA-256 if needed.
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/**
 * Cache key = version + source + method + hash(resolved URL + body).
 * `ds:<version>:<sourceId>:` prefix → Slice-7 evicts per-source by prefix or
 * globally by bumping `version` (cheaper than enumerating keys).
 */
export function buildCacheKey(
  sourceId: string,
  built: BuiltRequest,
  version = "0",
): string {
  return `ds:${version}:${sourceId}:${built.method}:${fnv1a(built.url)}-${fnv1a(built.body ?? "")}`;
}

/** In-memory ApiCache with TTL — dev/test default; Workers impl comes in Slice 3. */
export function createMemoryCache(now: () => number = Date.now): ApiCache {
  const store = new Map<string, { value: string; expiresAt: number }>();
  return {
    async get(key) {
      const hit = store.get(key);
      if (!hit) return null;
      if (hit.expiresAt <= now()) {
        store.delete(key);
        return null;
      }
      return hit.value;
    },
    async put(key, value, ttlSec) {
      store.set(key, { value, expiresAt: now() + ttlSec * 1000 });
    },
  };
}

/* --------------------------------------------------- oauth2 (Slice 8) */

const OAUTH2_TOKEN_TTL_MARGIN_SEC = 60;
const OAUTH2_TOKEN_DEFAULT_TTL_SEC = 3600;

/** Token cache key per source. Deliberately UNVERSIONED — purge targets the
 * response cache; a stale/revoked token self-heals via the 401 refresh. */
export function oauth2TokenCacheKey(sourceId: string): string {
  return `ds-oauth2-token:${sourceId}`;
}

/**
 * RFC 6749 client-credentials grant: POST the token URL (source.authParam)
 * with `grant_type=client_credentials`, client creds as Basic auth
 * (secret = "client_id:client_secret"). Token cached via the injected
 * ApiCache for `expires_in − margin`. Never throws.
 */
async function fetchOauth2Token(
  source: FetchSourceConfig,
  deps: { fetch: typeof fetch; cache: ApiCache | null; timeoutMs: number },
  forceRefresh: boolean,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const key = oauth2TokenCacheKey(source.id);
  if (!forceRefresh && deps.cache) {
    try {
      const hit = await deps.cache.get(key);
      if (hit) return { ok: true, token: hit };
    } catch {
      // cache trouble is never fatal
    }
  }

  if (!source.authParam || !source.secret) {
    return { ok: false, error: "oauth2 source is missing its token URL or client credentials" };
  }

  let res: Response;
  try {
    res = await deps.fetch(source.authParam, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${btoa(source.secret)}`, // client_secret_basic
      },
      body: "grant_type=client_credentials",
      // No redirect following: client creds must never travel to a host other
      // than the configured token URL. A redirecting endpoint → !res.ok below.
      redirect: "manual",
      signal: AbortSignal.timeout(deps.timeoutMs),
    });
  } catch (e) {
    return {
      ok: false,
      error: `oauth2 token fetch failed: ${e instanceof Error ? e.message : "network error"}`,
    };
  }
  if (!res.ok) return { ok: false, error: `oauth2 token endpoint responded ${res.status}` };

  // Same streaming size cap as the main fetch — a token endpoint is the same
  // trust level as the upstream API, and res.json() would buffer unbounded.
  let read: Awaited<ReturnType<typeof readBodyCapped>>;
  try {
    read = await readBodyCapped(res);
  } catch {
    return { ok: false, error: "could not read oauth2 token response" };
  }
  if (!read.ok) return { ok: false, error: "oauth2 token response too large" };
  let data: unknown;
  try {
    data = JSON.parse(read.text);
  } catch {
    return { ok: false, error: "oauth2 token response is not valid JSON" };
  }
  const obj = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const token = obj.access_token;
  if (typeof token !== "string" || token === "") {
    return { ok: false, error: "oauth2 token response has no access_token" };
  }

  const expiresIn =
    typeof obj.expires_in === "number" && obj.expires_in > 0
      ? obj.expires_in
      : OAUTH2_TOKEN_DEFAULT_TTL_SEC;
  const ttl = Math.max(expiresIn - OAUTH2_TOKEN_TTL_MARGIN_SEC, 30);
  if (deps.cache) {
    try {
      await deps.cache.put(key, token, ttl);
    } catch {
      // best-effort
    }
  }
  return { ok: true, token };
}

/* ------------------------------------------------------------- fetching */

/**
 * Read a response body with the size cap ENFORCED WHILE STREAMING: count raw
 * bytes per chunk and cancel the reader the moment the cap is exceeded, so a
 * chunked upstream (no content-length header) can never buffer unbounded data
 * into Worker memory. `res.text()` would buffer everything FIRST — the cap
 * must abort mid-stream to actually protect the isolate.
 * Falls back to `res.text()` + length check when there is no body stream
 * (some test mocks / exotic runtimes). Throws only on read errors — callers
 * wrap it like any network read.
 */
async function readBodyCapped(
  res: Response,
): Promise<{ ok: true; text: string } | { ok: false }> {
  const body = res.body;
  if (!body) {
    const text = await res.text();
    // ponytail: fallback counts UTF-16 units, not bytes — fine for a cap.
    return text.length > MAX_RESPONSE_BYTES ? { ok: false } : { ok: true, text };
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // best-effort abort
      }
      return { ok: false };
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return { ok: true, text };
}

function isIdempotentSafe(request: FetchRequestConfig): boolean {
  return request.method === "GET" || request.retryable === true;
}

/**
 * SSRF/secret boundary on redirects. Fetch's default `redirect: "follow"`
 * would let a compromised upstream 302 the Worker past the SAVE-TIME baseUrl
 * SSRF check (to 169.254.x / .internal) and forward the auth header / query
 * secret to any host it names. So redirects are followed MANUALLY, and a hop
 * is safe only if it stays on the SAME HOST — same origin, or an http→https
 * upgrade. Foreign host, https→http downgrade, non-http(s) scheme or a
 * missing/invalid Location all reject (gracefully, like every other failure).
 */
function resolveSafeRedirect(
  fromUrl: string,
  location: string | null,
): { ok: true; value: string } | { ok: false; error: string } {
  if (!location) return { ok: false, error: "upstream redirect without a Location header" };
  let from: URL;
  let to: URL;
  try {
    from = new URL(fromUrl);
    to = new URL(location, fromUrl);
  } catch {
    return { ok: false, error: "upstream redirect with an invalid Location" };
  }
  const sameOrigin = to.origin === from.origin;
  const httpsUpgrade =
    from.protocol === "http:" && to.protocol === "https:" && to.hostname === from.hostname;
  if (!sameOrigin && !httpsUpgrade) {
    return { ok: false, error: "upstream redirected to a different host" };
  }
  return { ok: true, value: to.toString() };
}

/**
 * THE central fetch: build → cache-check → fetch (timeout, ≤2 retries) →
 * parse JSON → cache-put. GRACEFUL: never throws; every failure is
 * `{ ok: false, error }` so the renderer degrades to placeholder, never 500s.
 */
export async function fetchSource(
  source: FetchSourceConfig,
  request: FetchRequestConfig,
  params: RequestParams = {},
  deps: FetchDeps = {},
): Promise<FetchSourceResult> {
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const built = buildRequest(source, request, params);
  if (!built.ok) return { ok: false, status: null, error: built.error };

  // oauth2: mint/reuse the Bearer token BEFORE the request. The token rides in
  // a header, so the cache key (URL+body) is unaffected.
  const tokenDeps = { fetch: doFetch, cache: deps.cache ?? null, timeoutMs };
  if (source.authType === "oauth2") {
    const tok = await fetchOauth2Token(source, tokenDeps, false);
    if (!tok.ok) return { ok: false, status: null, error: tok.error };
    built.value.headers["authorization"] = `Bearer ${tok.token}`;
  }

  const cacheable = request.cacheEnabled && isIdempotentSafe(request) && !!deps.cache;
  const key = cacheable ? buildCacheKey(source.id, built.value, deps.cacheVersion) : null;

  if (cacheable && key) {
    try {
      const hit = await deps.cache!.get(key);
      if (hit != null) {
        return { ok: true, status: 200, data: JSON.parse(hit), cached: true };
      }
    } catch {
      // cache trouble is never fatal — fall through to the network
    }
  }

  const maxAttempts = isIdempotentSafe(request) ? MAX_ATTEMPTS : 1;
  let lastError = "request failed";
  let lastStatus: number | null = null;
  let refreshedAuth = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) await sleep(BACKOFF_MS * (attempt - 1));

    // Manual redirect handling (see resolveSafeRedirect). Same-host hops only,
    // capped; 303 (and 301/302 on non-GET) re-issue as GET without body, per
    // spec. A rejected redirect returns immediately — retrying would just get
    // the same redirect again.
    let currentUrl = built.value.url;
    let currentMethod: HttpMethod = built.value.method;
    let currentBody = built.value.body;
    let redirects = 0;
    let res: Response;
    try {
      for (;;) {
        res = await doFetch(currentUrl, {
          method: currentMethod,
          headers: built.value.headers,
          body: currentBody,
          redirect: "manual",
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!REDIRECT_STATUSES.has(res.status)) break;
        const next = resolveSafeRedirect(currentUrl, res.headers.get("location"));
        if (!next.ok) return { ok: false, status: res.status, error: next.error };
        if (++redirects > MAX_REDIRECTS) {
          return { ok: false, status: res.status, error: "too many upstream redirects" };
        }
        if (res.status === 303 || (res.status !== 307 && res.status !== 308 && currentMethod !== "GET")) {
          currentMethod = "GET";
          currentBody = null;
        }
        currentUrl = next.value;
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : "network error";
      lastStatus = null;
      continue; // network error / timeout → retry (if attempts left)
    }

    if (res.status >= 500 || res.status === 429) {
      lastError = `upstream responded ${res.status}`;
      lastStatus = res.status;
      continue; // retryable status
    }
    if (res.status === 401 && source.authType === "oauth2" && !refreshedAuth) {
      // Cached token expired/revoked: ONE forced refresh, then re-fire. A 401
      // is rejected before any work happens, so this extra attempt is safe
      // even for non-idempotent requests (and doesn't eat the retry budget).
      refreshedAuth = true;
      const tok = await fetchOauth2Token(source, tokenDeps, true);
      if (!tok.ok) return { ok: false, status: 401, error: tok.error };
      built.value.headers["authorization"] = `Bearer ${tok.token}`;
      attempt -= 1;
      continue;
    }
    if (!res.ok) {
      // other 4xx: our request is wrong — retrying can't fix it
      return { ok: false, status: res.status, error: `upstream responded ${res.status}` };
    }

    // Size cap — reject oversized bodies before/after buffering (never retry:
    // the same request would get the same oversized answer).
    const contentLength = Number(res.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      return { ok: false, status: res.status, error: "upstream response too large" };
    }
    let read: Awaited<ReturnType<typeof readBodyCapped>>;
    try {
      read = await readBodyCapped(res);
    } catch {
      return { ok: false, status: res.status, error: "could not read upstream response" };
    }
    if (!read.ok) {
      return { ok: false, status: res.status, error: "upstream response too large" };
    }
    const text = read.text;
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { ok: false, status: res.status, error: "upstream response is not valid JSON" };
    }

    if (cacheable && key) {
      try {
        await deps.cache!.put(key, JSON.stringify(data), request.cacheTtlSec);
      } catch {
        // best-effort
      }
    }
    return { ok: true, status: res.status, data, cached: false };
  }

  return { ok: false, status: lastStatus, error: lastError };
}

/* -------------------------------------------------------------- mapping */

/** Resolve a dot-path ("main.temp", "list.0.name") into a JSON value. */
export function getPath(json: unknown, path: string): unknown {
  let cur: unknown = json;
  for (const seg of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/**
 * Map a response into component props via `prop <- dot.path`.
 * Array response → one props-object per element (List stamping);
 * object response → a single props-object. Anything else → null (graceful).
 */
export function mapResponse(
  json: unknown,
  fieldMap: Record<string, string>,
): Record<string, unknown>[] | Record<string, unknown> | null {
  const mapOne = (item: unknown): Record<string, unknown> => {
    const props: Record<string, unknown> = {};
    for (const [prop, path] of Object.entries(fieldMap)) {
      const v = getPath(item, path);
      if (v !== undefined) props[prop] = v;
    }
    return props;
  };
  if (Array.isArray(json)) return json.map(mapOne);
  if (json != null && typeof json === "object") return mapOne(json);
  return null;
}
