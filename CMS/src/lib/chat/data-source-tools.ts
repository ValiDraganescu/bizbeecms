/**
 * external-data-sources Slice 6 — AI tools for external API data sources.
 *
 *   - list_data_sources  → the configured sources + their saved requests (ids,
 *                          methods, paths, `{placeholder}` names) so the model
 *                          knows what it can test/bind without guessing ids.
 *   - create_data_source → define a source (base URL + auth + WRITE-ONLY secret)
 *                          and optionally its saved requests in one call.
 *   - test_data_source   → run a saved request LIVE (cache bypassed, mirroring
 *                          the Slice-4 test endpoint) so the model SEES the
 *                          response shape; the result includes the sample's leaf
 *                          dot-paths (`samplePaths`) — the raw material for
 *                          proposing a `prop ← json.path` field map when binding.
 *
 * Mirrors `binding-tools.ts` / `collection-tools.ts`: the PURE concerns (tool
 * schemas + arg shaping + response formatting) live here so they're unit-tested
 * with dep-free `node --test` (hence the relative `.ts` imports). The CF-coupled
 * work — store CRUD, secret decrypt, the live fetch — is wired in
 * `tool-dispatch.ts`. Secrets are WRITE-ONLY throughout: the model may SET one,
 * but no tool result ever contains it (only `hasSecret`).
 */
import {
  validateSourceInput,
  validateRequestInput,
  requestPlaceholders,
  AUTH_TYPES,
  HTTP_METHODS,
  type SourceInput,
  type RequestInput,
} from "../data-sources/validate.ts";
import type { RequestParams } from "../data-sources/fetch.ts";

export type ArgResult<T> = { ok: true; value: T } | { ok: false; error: string };

function asRecord(args: unknown): Record<string, unknown> | null {
  return typeof args === "object" && args !== null && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : null;
}

// ── Tool schemas (OpenAI/Workers-AI function-calling shape) ───────────────────

export const LIST_DATA_SOURCES_TOOL = {
  type: "function" as const,
  function: {
    name: "list_data_sources",
    description:
      "List the site's external API data sources and each source's SAVED REQUESTS " +
      "(id, name, method, path, query, and the {placeholder} names the request " +
      "expects). Use this to discover what can be tested (test_data_source) or " +
      "bound to components (bind_component / create_list / bind_list with " +
      "`source` + `request`). Secrets are never returned — only whether one is " +
      "set. Paged: the result includes a `total`; pass `offset` for more.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max sources to return (default 20, max 100)." },
        offset: { type: "number", description: "Skip this many rows (paging; default 0)." },
      },
    },
  },
} as const;

export const CREATE_DATA_SOURCE_TOOL = {
  type: "function" as const,
  function: {
    name: "create_data_source",
    description:
      "Define a new external API data source the site can bind components to: a " +
      "base URL, an auth method, an optional WRITE-ONLY secret, and optionally its " +
      "saved requests. Auth types: 'header' (secret sent in the header named " +
      "`authParam`, e.g. Authorization or X-API-Key — include any 'Bearer ' prefix " +
      "IN the secret), 'query' (secret sent as the query param named `authParam`, " +
      "e.g. appid), 'basic' (secret is 'user:password'), 'oauth2' (client " +
      "credentials: `authParam` is the token URL, secret is " +
      "'client_id:client_secret'; the engine mints/caches the Bearer token), " +
      "'none' (public API). The " +
      "secret is stored encrypted and NEVER returned by any tool. A saved request's " +
      "path, query values and JSON body template may contain {placeholder} tokens " +
      "filled at bind/test time. After creating, call test_data_source to see the " +
      "live response shape.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Human-readable source name (unique-ish, 1–100 chars)." },
        baseUrl: { type: "string", description: "Absolute http(s) base URL, e.g. https://api.open-meteo.com" },
        authType: { type: "string", enum: [...AUTH_TYPES], description: "Auth method (default 'none')." },
        authParam: { type: "string", description: "Header name (authType 'header'), query key (authType 'query'), or token URL (authType 'oauth2')." },
        secret: { type: "string", description: "The API key / 'user:password' / 'client_id:client_secret'. WRITE-ONLY — stored encrypted, never shown again." },
        requests: {
          type: "array",
          description: "Saved requests to create on this source (each is what you test/bind).",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Request name, 1–100 chars." },
              method: { type: "string", enum: [...HTTP_METHODS], description: "Default GET." },
              path: { type: "string", description: "Path relative to baseUrl; may contain {placeholder} tokens." },
              query: { type: "object", description: "Query params as string values; values may contain {placeholder} tokens." },
              bodyTemplate: { type: "string", description: "JSON body template for POST/PUT/DELETE; may contain {placeholder} tokens." },
              cacheEnabled: { type: "boolean", description: "Cache responses at render (default true)." },
              cacheTtlSec: { type: "number", description: "Cache TTL in seconds (default 60)." },
              retryable: { type: "boolean", description: "Mark a non-GET request as idempotent-safe (enables retries + caching for it)." },
            },
            required: ["name", "path"],
          },
        },
      },
      required: ["name", "baseUrl"],
    },
  },
} as const;

export const TEST_DATA_SOURCE_TOOL = {
  type: "function" as const,
  function: {
    name: "test_data_source",
    description:
      "Run a data source's saved request LIVE (cache bypassed) and return the " +
      "upstream response so you can SEE its shape before binding. The result's " +
      "`paths` array lists every leaf dot-path in the sample (e.g. 'main.temp', " +
      "'list.0.name') — use those as `map` values when binding an API source to a " +
      "component (map each DECLARED component prop to the dot-path whose value " +
      "should fill it). Identify the source and request by id OR name " +
      "(list_data_sources shows both). Pass `params` values for every " +
      "{placeholder} the request expects. The auth secret is injected server-side " +
      "and never appears in the response.",
    parameters: {
      type: "object",
      properties: {
        source: { type: "string", description: "The data source id or name." },
        request: { type: "string", description: "The saved request id or name." },
        params: { type: "object", description: "Values for the request's {placeholder} tokens, e.g. { city: 'Helsinki' }." },
      },
      required: ["source", "request"],
    },
  },
} as const;

// ── Pure arg validation/coercion ──────────────────────────────────────────────

export interface CreateDataSourceArgs {
  source: SourceInput;
  /** WRITE-ONLY plaintext secret (encrypted at rest by the store), or null. */
  secret: string | null;
  requests: RequestInput[];
}

export function validateCreateDataSource(args: unknown): ArgResult<CreateDataSourceArgs> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with name and baseUrl" };

  const source = validateSourceInput(rec);
  if (!source.ok) return source;

  let secret: string | null = null;
  if (rec.secret != null && rec.secret !== "") {
    if (typeof rec.secret !== "string") return { ok: false, error: "secret must be a string" };
    secret = rec.secret;
  }
  if (source.value.authType !== "none" && !secret) {
    return { ok: false, error: `authType "${source.value.authType}" needs a secret (the API key / user:password / client_id:client_secret)` };
  }

  const requests: RequestInput[] = [];
  if (rec.requests !== undefined) {
    if (!Array.isArray(rec.requests)) return { ok: false, error: "requests must be an array" };
    for (let i = 0; i < rec.requests.length; i++) {
      const r = validateRequestInput(rec.requests[i]);
      if (!r.ok) return { ok: false, error: `requests[${i}]: ${r.error}` };
      requests.push(r.value);
    }
  }

  return { ok: true, value: { source: source.value, secret, requests } };
}

export interface TestDataSourceArgs {
  source: string;
  request: string;
  params: RequestParams;
}

export function validateTestDataSource(args: unknown): ArgResult<TestDataSourceArgs> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with source and request" };
  const source = typeof rec.source === "string" ? rec.source.trim() : "";
  if (!source) return { ok: false, error: "source (id or name) is required — list_data_sources shows them" };
  const request = typeof rec.request === "string" ? rec.request.trim() : "";
  if (!request) return { ok: false, error: "request (saved request id or name) is required — list_data_sources shows them" };

  const params: RequestParams = {};
  if (rec.params !== undefined) {
    const raw = asRecord(rec.params);
    if (!raw) return { ok: false, error: "params must be an object of placeholder → value" };
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") {
        return { ok: false, error: `param "${k}" must be a string, number, or boolean` };
      }
      params[k] = v;
    }
  }
  return { ok: true, value: { source, request, params } };
}

// ── Pure result formatting ────────────────────────────────────────────────────

/** Structural subset of the store's Safe DTOs (this module stays store-free). */
type SourceLike = {
  id: string;
  name: string;
  baseUrl: string;
  authType: string;
  hasSecret: boolean;
};
type RequestLike = {
  id: string;
  name: string;
  method: string;
  path: string;
  query: Record<string, string>;
  bodyTemplate: string | null;
  cacheEnabled: boolean;
  cacheTtlSec: number;
  retryable: boolean;
};

/** One source + its saved requests, shaped for the model (never the secret). */
export function formatSource(source: SourceLike, requests: RequestLike[]): Record<string, unknown> {
  return {
    id: source.id,
    name: source.name,
    baseUrl: source.baseUrl,
    authType: source.authType,
    hasSecret: source.hasSecret,
    requests: requests.map((r) => ({
      id: r.id,
      name: r.name,
      method: r.method,
      path: r.path,
      query: r.query,
      hasBody: r.bodyTemplate != null && r.bodyTemplate !== "",
      placeholders: requestPlaceholders(r),
      cacheEnabled: r.cacheEnabled,
      cacheTtlSec: r.cacheTtlSec,
      retryable: r.retryable,
    })),
  };
}

/**
 * A sample response sized for the model's context: small JSON passes through
 * verbatim; a huge one becomes a truncated string preview (the `paths` array in
 * the tool result still covers the FULL sample, so mapping isn't impaired).
 */
export const MAX_SAMPLE_CHARS = 15_000;

export function sampleForModel(data: unknown, maxChars = MAX_SAMPLE_CHARS): unknown {
  let json: string;
  try {
    json = JSON.stringify(data) ?? "null";
  } catch {
    return "(unserializable response)";
  }
  if (json.length <= maxChars) return data;
  return `${json.slice(0, maxChars)}… (truncated — full response was ${json.length} chars; use \`paths\` for the complete shape)`;
}
