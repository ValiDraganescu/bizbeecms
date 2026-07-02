/**
 * external-data-sources Slice 1 — pure validation for data sources + saved
 * requests. NO `@/` imports, NO React/drizzle/CF bindings — node-testable
 * (scripts/data-source-validate.test.mjs), the project's pure-module convention.
 *
 * Trust boundary: the operator (or the AI) supplies the base URL the Worker
 * will later fetch — validate it's an absolute http(s) URL and block obvious
 * internal targets (SSRF; the Worker makes the request). `{placeholder}` tokens
 * in path/query/body are filled at bind time from component props — here we
 * only validate their SYNTAX; the Slice-2 engine owns safe encoding on insert.
 */

export const AUTH_TYPES = ["header", "query", "basic", "oauth2", "none"] as const;
export type AuthType = (typeof AUTH_TYPES)[number];

export const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export const MIN_CACHE_TTL_SEC = 1;
export const MAX_CACHE_TTL_SEC = 86400; // 1 day
export const DEFAULT_CACHE_TTL_SEC = 60;

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

export type SourceInput = {
  name: string;
  baseUrl: string;
  authType: AuthType;
  /** Header name / query key; TOKEN URL for oauth2; null for basic/none. */
  authParam: string | null;
};

export type RequestInput = {
  name: string;
  method: HttpMethod;
  path: string;
  /** Query params as string→string; values may contain {placeholders}. */
  query: Record<string, string>;
  /** JSON body template (string) for POST/PUT/DELETE; null otherwise. */
  bodyTemplate: string | null;
  cacheEnabled: boolean;
  cacheTtlSec: number;
  retryable: boolean;
};

/* ------------------------------------------------------------------ URL */

// Hostnames / suffixes the Worker must never be pointed at (SSRF). Light v1
// per GOAL — "note the boundary even if light".
const BLOCKED_HOSTS = new Set(["localhost", "0.0.0.0", "[::1]", "::1"]);
const BLOCKED_SUFFIXES = [".localhost", ".internal", ".local"];

function isPrivateIPv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 127 || a === 10) return true;
  if (a === 169 && b === 254) return true; // link-local / CF metadata
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/** Absolute http(s) URL whose host isn't an obvious internal target. */
export function validateBaseUrl(raw: unknown): Validated<string> {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, error: "baseUrl is required" };
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "baseUrl must be an absolute URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "baseUrl must use http or https" };
  }
  const host = url.hostname.toLowerCase();
  if (
    BLOCKED_HOSTS.has(host) ||
    BLOCKED_SUFFIXES.some((s) => host.endsWith(s)) ||
    isPrivateIPv4(host)
  ) {
    return { ok: false, error: "baseUrl points at a blocked internal host" };
  }
  return { ok: true, value: url.toString() };
}

/* --------------------------------------------------------- placeholders */

// {city} — identifier-ish names only, so a stray "{" is caught early instead
// of silently reaching the fetch engine.
const PLACEHOLDER_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

/** Distinct placeholder names in a template string, in first-seen order. */
export function extractPlaceholders(template: string): string[] {
  const seen = new Set<string>();
  for (const m of template.matchAll(PLACEHOLDER_RE)) seen.add(m[1]);
  return [...seen];
}

/** True if every `{` / `}` in the string belongs to a well-formed placeholder. */
export function hasValidPlaceholderSyntax(template: string): boolean {
  return !template.replace(PLACEHOLDER_RE, "").match(/[{}]/);
}

/**
 * Distinct `{placeholder}` names across a saved request's path, query values,
 * and body template, in first-seen order — the Slice-4 Test UI renders one
 * test-param input per name. A JSON body's structural `{}` never matches (the
 * regex only accepts identifier-ish names right after `{`).
 */
export function requestPlaceholders(request: {
  path: string;
  query: Record<string, string>;
  bodyTemplate: string | null;
}): string[] {
  const seen = new Set<string>();
  for (const tpl of [request.path, ...Object.values(request.query), request.bodyTemplate ?? ""]) {
    for (const name of extractPlaceholders(tpl)) seen.add(name);
  }
  return [...seen];
}

/* --------------------------------------------------------------- source */

export function validateSourceInput(input: unknown): Validated<SourceInput> {
  const obj = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >;

  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (name.length < 1 || name.length > 100) {
    return { ok: false, error: "name must be 1–100 characters" };
  }

  const baseUrl = validateBaseUrl(obj.baseUrl);
  if (!baseUrl.ok) return baseUrl;

  const authType = obj.authType ?? "none";
  if (!AUTH_TYPES.includes(authType as AuthType)) {
    return { ok: false, error: `authType must be one of: ${AUTH_TYPES.join(", ")}` };
  }

  // header/query need the parameter NAME the secret rides in; oauth2 needs the
  // TOKEN URL (rides in authParam — no schema change); basic/none need nothing.
  let authParam: string | null = null;
  if (authType === "header" || authType === "query") {
    authParam = typeof obj.authParam === "string" ? obj.authParam.trim() : "";
    if (!authParam || !/^[\w-]{1,100}$/.test(authParam)) {
      return {
        ok: false,
        error: "authParam (header name / query key) is required for header/query auth",
      };
    }
  } else if (authType === "oauth2") {
    // Same SSRF boundary as baseUrl — the Worker POSTs client creds there.
    const tokenUrl = validateBaseUrl(obj.authParam);
    if (!tokenUrl.ok) {
      return { ok: false, error: "authParam (token URL) must be a valid external http(s) URL for oauth2 auth" };
    }
    authParam = tokenUrl.value;
  }

  return {
    ok: true,
    value: { name, baseUrl: baseUrl.value, authType: authType as AuthType, authParam },
  };
}

/* -------------------------------------------------------------- request */

export function validateRequestInput(input: unknown): Validated<RequestInput> {
  const obj = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >;

  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (name.length < 1 || name.length > 100) {
    return { ok: false, error: "name must be 1–100 characters" };
  }

  const method = typeof obj.method === "string" ? obj.method.toUpperCase() : "GET";
  if (!HTTP_METHODS.includes(method as HttpMethod)) {
    return { ok: false, error: `method must be one of: ${HTTP_METHODS.join(", ")}` };
  }

  const path = typeof obj.path === "string" ? obj.path.trim() : "";
  if (path.length > 2000) return { ok: false, error: "path too long" };
  // The path joins onto the source's baseUrl — an absolute URL here would
  // silently retarget the request past the SSRF check above.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path) || path.startsWith("//")) {
    return { ok: false, error: "path must be relative to the source baseUrl" };
  }
  if (!hasValidPlaceholderSyntax(path)) {
    return { ok: false, error: "path has malformed {placeholder} syntax" };
  }

  const rawQuery = obj.query ?? {};
  if (typeof rawQuery !== "object" || rawQuery === null || Array.isArray(rawQuery)) {
    return { ok: false, error: "query must be an object of string values" };
  }
  const query: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawQuery as Record<string, unknown>)) {
    if (typeof v !== "string") {
      return { ok: false, error: `query value for "${k}" must be a string` };
    }
    if (!hasValidPlaceholderSyntax(v)) {
      return { ok: false, error: `query value for "${k}" has malformed {placeholder} syntax` };
    }
    query[k] = v;
  }

  let bodyTemplate: string | null = null;
  if (obj.bodyTemplate != null && obj.bodyTemplate !== "") {
    if (typeof obj.bodyTemplate !== "string") {
      return { ok: false, error: "bodyTemplate must be a string" };
    }
    if (method === "GET") {
      return { ok: false, error: "GET requests cannot have a body" };
    }
    if (obj.bodyTemplate.length > 100_000) {
      return { ok: false, error: "bodyTemplate too long" };
    }
    // NOTE: no placeholder-syntax check here — a JSON body template's own
    // structural `{}` braces are legal; the Slice-2 engine substitutes only
    // well-formed `{name}` tokens and JSON-escapes the values.
    bodyTemplate = obj.bodyTemplate;
  }

  const cacheEnabled = obj.cacheEnabled == null ? true : obj.cacheEnabled === true;
  const rawTtl = obj.cacheTtlSec ?? DEFAULT_CACHE_TTL_SEC;
  const cacheTtlSec = typeof rawTtl === "number" && Number.isInteger(rawTtl) ? rawTtl : NaN;
  if (
    Number.isNaN(cacheTtlSec) ||
    cacheTtlSec < MIN_CACHE_TTL_SEC ||
    cacheTtlSec > MAX_CACHE_TTL_SEC
  ) {
    return {
      ok: false,
      error: `cacheTtlSec must be an integer between ${MIN_CACHE_TTL_SEC} and ${MAX_CACHE_TTL_SEC}`,
    };
  }

  const retryable = obj.retryable === true;

  return {
    ok: true,
    value: {
      name,
      method: method as HttpMethod,
      path,
      query,
      bodyTemplate,
      cacheEnabled,
      cacheTtlSec,
      retryable,
    },
  };
}
