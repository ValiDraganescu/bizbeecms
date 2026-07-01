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
  /** Header name / query key the secret rides in (header/query auth). */
  authParam: string | null;
  /** DECRYPTED secret; for basic auth the stored secret is "user:password". */
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

  // Auth — the only place a secret touches a request.
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

/* ------------------------------------------------------------- fetching */

function isIdempotentSafe(request: FetchRequestConfig): boolean {
  return request.method === "GET" || request.retryable === true;
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

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) await sleep(BACKOFF_MS * (attempt - 1));

    let res: Response;
    try {
      res = await doFetch(built.value.url, {
        method: built.value.method,
        headers: built.value.headers,
        body: built.value.body,
        signal: AbortSignal.timeout(timeoutMs),
      });
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
    if (!res.ok) {
      // other 4xx: our request is wrong — retrying can't fix it
      return { ok: false, status: res.status, error: `upstream responded ${res.status}` };
    }

    let data: unknown;
    try {
      data = await res.json();
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
