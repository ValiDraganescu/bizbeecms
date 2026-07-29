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
  type AuthType,
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
        secret: { type: "string", description: "The API key / 'user:password' / 'client_id:client_secret'. WRITE-ONLY — stored encrypted, never shown again. Required for any authType except 'none'; if the operator hasn't provided the real credential, don't block — pass the literal placeholder 'PLACEHOLDER' and tell them to paste the real key in Admin → Data Sources (requests fail auth until then)." },
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

export const UPDATE_DATA_SOURCE_TOOL = {
  type: "function" as const,
  function: {
    name: "update_data_source",
    description:
      "Patch an existing data source (address it by id or name). Only the " +
      "fields you pass change: omitted = keep the stored value, null = " +
      "clear/reset, a value = replace. The secret stays WRITE-ONLY: omit it to " +
      "KEEP the stored credential (so you can rotate baseUrl/name without " +
      "re-pasting the key) — no tool ever returns it. Setting authType 'none' " +
      "clears the stored secret; switching TO an auth type requires a secret " +
      "already stored or supplied in the same call. baseUrl/auth fields are " +
      "validated exactly like create_data_source.",
    parameters: {
      type: "object",
      properties: {
        source: { type: "string", description: "The data source to patch — its id or name (list_data_sources shows both)." },
        name: { type: "string", description: "New source name (1–100 chars). Omit to keep." },
        baseUrl: { type: "string", description: "New absolute http(s) base URL. Omit to keep." },
        authType: { type: "string", enum: [...AUTH_TYPES], description: "New auth method. 'none' clears the stored secret. Omit to keep; null resets to 'none'." },
        authParam: { type: "string", description: "Header name / query key / oauth2 token URL. null clears it (only valid for authType 'basic'/'none'). Omit to keep." },
        secret: { type: "string", description: "New WRITE-ONLY secret. OMIT to keep the stored one; null clears it (only valid with authType 'none')." },
      },
      required: ["source"],
    },
  },
} as const;

export const SET_DATA_SOURCE_REQUEST_TOOL = {
  type: "function" as const,
  function: {
    name: "set_data_source_request",
    description:
      "Upsert ONE saved request on a data source. Address the source by id or " +
      "name and the request by id or name: a match is PATCHED — only the " +
      "fields you pass change, and its id stays STABLE so existing bindings " +
      "and chat-agent allowlists keep working; no match CREATES a request " +
      "(then `path` is required, and its name is `name` or the `request` ref). " +
      "Patch semantics: omitted = keep, null = reset to the default (method " +
      "GET, cacheEnabled true, cacheTtlSec 60, retryable false, no body). " +
      "`query` merges PER-KEY: pass only the keys to change; a null value " +
      "DELETES that key; omitted keys stay.",
    parameters: {
      type: "object",
      properties: {
        source: { type: "string", description: "The data source — its id or name." },
        request: { type: "string", description: "The saved request to patch (id or name); no match creates it." },
        name: { type: "string", description: "Rename the request (1–100 chars), or the name for a created one." },
        method: { type: "string", enum: [...HTTP_METHODS], description: "HTTP method. null resets to GET." },
        path: { type: "string", description: "Path relative to baseUrl; may contain {placeholder} tokens." },
        query: { type: "object", description: "PER-KEY merge into the stored query: string value sets the key, null DELETES it, omitted keys stay." },
        bodyTemplate: { type: "string", description: "JSON body template for POST/PUT/DELETE. null removes the body." },
        cacheEnabled: { type: "boolean", description: "Cache responses at render. null resets to true." },
        cacheTtlSec: { type: "number", description: "Cache TTL in seconds. null resets to 60." },
        retryable: { type: "boolean", description: "Non-GET idempotent-safe flag. null resets to false." },
      },
      required: ["source", "request"],
    },
  },
} as const;

export const DELETE_DATA_SOURCE_REQUEST_TOOL = {
  type: "function" as const,
  function: {
    name: "delete_data_source_request",
    description:
      "Delete ONE saved request from a data source (source and request by id " +
      "or name). BLOCKED while anything references the request — a block " +
      "binding, List, form, or a chat agent's allowlist: the error names " +
      "every referencing place and the tool that clears each; remove them " +
      "all, then retry. There is no force flag.",
    parameters: {
      type: "object",
      properties: {
        source: { type: "string", description: "The data source — its id or name." },
        request: { type: "string", description: "The saved request to delete — its id or name." },
      },
      required: ["source", "request"],
    },
  },
} as const;

export const DELETE_DATA_SOURCE_TOOL = {
  type: "function" as const,
  function: {
    name: "delete_data_source",
    description:
      "Delete a data source AND all its saved requests (address it by id or " +
      "name). Its encrypted secret is destroyed with it. BLOCKED while the " +
      "source or any of its requests is referenced — a block binding, List, " +
      "form, or a chat agent's allowlist: the error names every referencing " +
      "place and the tool that clears each; remove them all, then retry. " +
      "There is no force flag.",
    parameters: {
      type: "object",
      properties: {
        source: { type: "string", description: "The data source to delete — its id or name." },
      },
      required: ["source"],
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
    return { ok: false, error: `authType "${source.value.authType}" needs a secret (the API key / user:password / client_id:client_secret). If the operator hasn't provided the real credential, retry the SAME call with secret "PLACEHOLDER" and tell them to paste the real key in Admin → Data Sources.` };
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

// ── update_data_source (patch semantics: omitted=keep, null=clear) ───────────

/** A partial source patch. Absent key = keep the stored value. */
export interface SourcePatch {
  name?: string;
  baseUrl?: string;
  authType?: AuthType;
  /** null = clear (valid only when the final authType is basic/none). */
  authParam?: string | null;
  /** WRITE-ONLY: absent = keep stored secret, null = clear, string = replace. */
  secret?: string | null;
}

export interface UpdateDataSourceArgs {
  sourceRef: string;
  patch: SourcePatch;
}

const SOURCE_PATCH_KEYS = ["name", "baseUrl", "authType", "authParam", "secret"] as const;

export function validateUpdateDataSource(args: unknown): ArgResult<UpdateDataSourceArgs> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with `source` (the data source id or name) plus the fields to change" };

  const sourceRef = typeof rec.source === "string" ? rec.source.trim() : "";
  if (!sourceRef) return { ok: false, error: "source (id or name) is required — list_data_sources shows them" };

  const patch: SourcePatch = {};
  if ("name" in rec) {
    if (typeof rec.name !== "string" || rec.name.trim() === "") {
      return { ok: false, error: "`name` cannot be cleared — a source always has a name. Pass a new 1–100 char name, or omit `name` to keep the current one." };
    }
    patch.name = rec.name;
  }
  if ("baseUrl" in rec) {
    if (typeof rec.baseUrl !== "string" || rec.baseUrl.trim() === "") {
      return { ok: false, error: "`baseUrl` cannot be cleared — a source always has a base URL. Pass a new absolute http(s) URL, or omit `baseUrl` to keep the current one." };
    }
    patch.baseUrl = rec.baseUrl;
  }
  if ("authType" in rec) {
    // null = reset to the default auth type ('none', same default as create).
    const raw = rec.authType ?? "none";
    if (!AUTH_TYPES.includes(raw as AuthType)) {
      return { ok: false, error: `authType "${String(raw)}" is not valid — use one of: ${AUTH_TYPES.join(", ")} (or omit \`authType\` to keep the current one)` };
    }
    patch.authType = raw as AuthType;
  }
  if ("authParam" in rec) {
    if (rec.authParam === null) patch.authParam = null;
    else if (typeof rec.authParam === "string") patch.authParam = rec.authParam;
    else return { ok: false, error: "`authParam` must be a string (header name / query key / oauth2 token URL) or null to clear it" };
  }
  if ("secret" in rec) {
    if (rec.secret === null || rec.secret === "") patch.secret = null;
    else if (typeof rec.secret === "string") patch.secret = rec.secret;
    else return { ok: false, error: "`secret` must be a string (WRITE-ONLY; omit it to keep the stored one, null to clear)" };
  }

  if (SOURCE_PATCH_KEYS.every((k) => !(k in patch))) {
    return { ok: false, error: `nothing to change — pass at least one of ${SOURCE_PATCH_KEYS.join(", ")} (omitted fields keep their stored values)` };
  }
  return { ok: true, value: { sourceRef, patch } };
}

/** The stored source fields the patch merges onto (SafeDataSource subset). */
export type StoredSource = {
  name: string;
  baseUrl: string;
  authType: string;
  authParam: string | null;
  hasSecret: boolean;
};

/**
 * Merge a SourcePatch onto the stored source and re-validate the RESULT with
 * the same gate create_data_source uses (SSRF/baseUrl/authParam rules).
 * Returns the full SourceInput for the store plus the secret to write:
 * `undefined` = keep stored, `null` = clear, string = replace — enforcing the
 * auth↔secret invariants (authType 'none' clears; non-none needs one stored
 * or supplied).
 */
export function applySourcePatch(
  existing: StoredSource,
  patch: SourcePatch,
): ArgResult<{ source: SourceInput; secret: string | null | undefined }> {
  const merged = validateSourceInput({
    name: patch.name !== undefined ? patch.name : existing.name,
    baseUrl: patch.baseUrl !== undefined ? patch.baseUrl : existing.baseUrl,
    authType: patch.authType !== undefined ? patch.authType : existing.authType,
    authParam: patch.authParam !== undefined ? patch.authParam : existing.authParam,
  });
  if (!merged.ok) return merged;

  const authType = merged.value.authType;
  if (authType === "none") {
    if (typeof patch.secret === "string") {
      return { ok: false, error: `authType "none" stores no secret — drop the \`secret\` field, or set authType to one of: ${AUTH_TYPES.filter((t) => t !== "none").join(", ")}` };
    }
    // 'none' auth never keeps a credential around — always clear it.
    return { ok: true, value: { source: merged.value, secret: null } };
  }

  const secret = patch.secret;
  const willHaveSecret = secret !== undefined ? secret !== null : existing.hasSecret;
  if (!willHaveSecret) {
    const why = secret === null ? "this call clears the stored one" : "this source has no secret stored";
    return { ok: false, error: `authType "${authType}" needs a secret and ${why} — supply \`secret\` in the same call (use "PLACEHOLDER" if the operator hasn't provided the real credential and tell them to paste it in Admin → Data Sources), or set authType "none".` };
  }
  return { ok: true, value: { source: merged.value, secret } };
}

// ── set_data_source_request (upsert; per-key query merge) ────────────────────

/**
 * A partial saved-request patch. Absent key = keep the stored value; `null` =
 * reset that field to its default (method GET, cacheEnabled true, cacheTtlSec
 * 60, retryable false, no body). `query` merges PER-KEY (null deletes a key).
 */
export interface RequestPatch {
  name?: string;
  method?: string | null;
  path?: string;
  query?: Record<string, string | null>;
  bodyTemplate?: string | null;
  cacheEnabled?: boolean | null;
  cacheTtlSec?: number | null;
  retryable?: boolean | null;
}

export interface SetDataSourceRequestArgs {
  sourceRef: string;
  requestRef: string;
  patch: RequestPatch;
}

const REQUEST_PATCH_KEYS = [
  "name", "method", "path", "query", "bodyTemplate", "cacheEnabled", "cacheTtlSec", "retryable",
] as const;

export function validateSetDataSourceRequest(args: unknown): ArgResult<SetDataSourceRequestArgs> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with `source` and `request` (ids or names) plus the fields to change" };

  const sourceRef = typeof rec.source === "string" ? rec.source.trim() : "";
  if (!sourceRef) return { ok: false, error: "source (id or name) is required — list_data_sources shows them" };
  const requestRef = typeof rec.request === "string" ? rec.request.trim() : "";
  if (!requestRef) return { ok: false, error: "request (saved request id or name) is required — a match is patched, no match creates it" };

  const patch: RequestPatch = {};
  if ("name" in rec) {
    if (typeof rec.name !== "string" || rec.name.trim() === "") {
      return { ok: false, error: "`name` cannot be cleared — a request always has a name. Pass a new 1–100 char name, or omit `name` to keep the current one." };
    }
    patch.name = rec.name;
  }
  if ("method" in rec) {
    if (rec.method !== null && typeof rec.method !== "string") {
      return { ok: false, error: `\`method\` must be one of: ${HTTP_METHODS.join(", ")} (or null to reset to GET)` };
    }
    patch.method = rec.method as string | null;
  }
  if ("path" in rec) {
    if (typeof rec.path !== "string") {
      return { ok: false, error: "`path` cannot be cleared — a request always has a path relative to the source baseUrl. Pass a new one, or omit `path` to keep the current one." };
    }
    patch.path = rec.path;
  }
  if ("query" in rec) {
    const raw = asRecord(rec.query);
    if (!raw) return { ok: false, error: "`query` must be an object merged PER-KEY into the stored query: string value sets the key, null deletes it, omitted keys stay" };
    const query: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v !== null && typeof v !== "string") {
        return { ok: false, error: `query value for "${k}" must be a string (or null to DELETE the "${k}" key)` };
      }
      query[k] = v;
    }
    patch.query = query;
  }
  if ("bodyTemplate" in rec) {
    if (rec.bodyTemplate !== null && typeof rec.bodyTemplate !== "string") {
      return { ok: false, error: "`bodyTemplate` must be a JSON template string (or null to remove the body)" };
    }
    patch.bodyTemplate = rec.bodyTemplate as string | null;
  }
  if ("cacheEnabled" in rec) {
    if (rec.cacheEnabled !== null && typeof rec.cacheEnabled !== "boolean") {
      return { ok: false, error: "`cacheEnabled` must be a boolean (or null to reset to true)" };
    }
    patch.cacheEnabled = rec.cacheEnabled as boolean | null;
  }
  if ("cacheTtlSec" in rec) {
    if (rec.cacheTtlSec !== null && typeof rec.cacheTtlSec !== "number") {
      return { ok: false, error: "`cacheTtlSec` must be a number of seconds (or null to reset to the default)" };
    }
    patch.cacheTtlSec = rec.cacheTtlSec as number | null;
  }
  if ("retryable" in rec) {
    if (rec.retryable !== null && typeof rec.retryable !== "boolean") {
      return { ok: false, error: "`retryable` must be a boolean (or null to reset to false)" };
    }
    patch.retryable = rec.retryable as boolean | null;
  }

  return { ok: true, value: { sourceRef, requestRef, patch } };
}

/** The stored request fields the patch merges onto (SafeDataSourceRequest subset). */
export type StoredRequest = {
  name: string;
  method: string;
  path: string;
  query: Record<string, string>;
  bodyTemplate: string | null;
  cacheEnabled: boolean;
  cacheTtlSec: number;
  retryable: boolean;
};

/**
 * Merge a RequestPatch onto the stored request (or build a NEW one when
 * `existing` is null — the upsert's create branch) and re-validate the RESULT
 * with the same gate create_data_source uses. `null` patch values fall back to
 * the field's default via that shared validator; `query` merges per-key with
 * null deleting the key. Pure — the handler owns id resolution and the store
 * write (updating in place so the request id stays stable).
 */
export function applyRequestPatch(
  existing: StoredRequest | null,
  requestRef: string,
  patch: RequestPatch,
): ArgResult<{ action: "created" | "updated"; request: RequestInput }> {
  if (!existing) {
    if (patch.path === undefined) {
      return { ok: false, error: `no saved request "${requestRef}" on this source, so this call would CREATE one — but creating requires \`path\` (relative to the source baseUrl). To PATCH an existing request instead, pass its exact id or name (list_data_sources shows them).` };
    }
    const query: Record<string, string> = {};
    for (const [k, v] of Object.entries(patch.query ?? {})) {
      if (v !== null) query[k] = v; // deleting a key that doesn't exist = no-op
    }
    const created = validateRequestInput({
      name: patch.name ?? requestRef,
      method: patch.method ?? undefined,
      path: patch.path,
      query,
      bodyTemplate: patch.bodyTemplate ?? undefined,
      cacheEnabled: patch.cacheEnabled ?? undefined,
      cacheTtlSec: patch.cacheTtlSec ?? undefined,
      retryable: patch.retryable ?? undefined,
    });
    if (!created.ok) return created;
    return { ok: true, value: { action: "created", request: created.value } };
  }

  if (REQUEST_PATCH_KEYS.every((k) => !(k in patch))) {
    return { ok: false, error: `nothing to change on saved request "${existing.name}" — pass at least one of ${REQUEST_PATCH_KEYS.join(", ")} (omitted fields keep their stored values)` };
  }

  const query = { ...existing.query };
  for (const [k, v] of Object.entries(patch.query ?? {})) {
    if (v === null) delete query[k];
    else query[k] = v;
  }
  // Absent patch key = keep stored; null = drop to let the shared validator
  // apply the field's default (the ONE place defaults live).
  const merged = validateRequestInput({
    name: patch.name !== undefined ? patch.name : existing.name,
    method: patch.method !== undefined ? patch.method ?? undefined : existing.method,
    path: patch.path !== undefined ? patch.path : existing.path,
    query,
    bodyTemplate: patch.bodyTemplate !== undefined ? patch.bodyTemplate : existing.bodyTemplate,
    cacheEnabled: patch.cacheEnabled !== undefined ? patch.cacheEnabled ?? undefined : existing.cacheEnabled,
    cacheTtlSec: patch.cacheTtlSec !== undefined ? patch.cacheTtlSec ?? undefined : existing.cacheTtlSec,
    retryable: patch.retryable !== undefined ? patch.retryable ?? undefined : existing.retryable,
  });
  if (!merged.ok) return merged;
  return { ok: true, value: { action: "updated", request: merged.value } };
}

// ── delete_data_source_request / delete_data_source ──────────────────────────

export function validateDeleteDataSourceRequest(
  args: unknown,
): ArgResult<{ sourceRef: string; requestRef: string }> {
  const rec = asRecord(args);
  const sourceRef = typeof rec?.source === "string" ? rec.source.trim() : "";
  const requestRef = typeof rec?.request === "string" ? rec.request.trim() : "";
  if (!sourceRef || !requestRef) {
    return { ok: false, error: "pass `source` and `request` (ids or names) — list_data_sources shows them" };
  }
  return { ok: true, value: { sourceRef, requestRef } };
}

export function validateDeleteDataSource(args: unknown): ArgResult<{ sourceRef: string }> {
  const rec = asRecord(args);
  const sourceRef = typeof rec?.source === "string" ? rec.source.trim() : "";
  if (!sourceRef) {
    return { ok: false, error: "pass `source` (the data source id or name) — list_data_sources shows them" };
  }
  return { ok: true, value: { sourceRef } };
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

/** One saved request, shaped for the model (id + the bindable surface). */
export function formatRequest(r: RequestLike): Record<string, unknown> {
  return {
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
  };
}

/** One source + its saved requests, shaped for the model (never the secret). */
export function formatSource(source: SourceLike, requests: RequestLike[]): Record<string, unknown> {
  return {
    id: source.id,
    name: source.name,
    baseUrl: source.baseUrl,
    authType: source.authType,
    hasSecret: source.hasSecret,
    requests: requests.map(formatRequest),
  };
}

/**
 * A sample response sized for the model's context: small JSON passes through
 * verbatim; a huge one becomes a truncated string preview (the `paths` array in
 * the tool result still covers the FULL sample, so mapping isn't impaired).
 */
export const MAX_SAMPLE_CHARS = 15_000;

export function sampleForModel(
  data: unknown,
  maxChars = MAX_SAMPLE_CHARS,
  // The self-correction the reader can actually perform: the admin tool result
  // carries a `paths` array; callers whose result has no `paths` (guest chat)
  // pass their own hint.
  hint = "use `paths` for the complete shape",
): unknown {
  let json: string;
  try {
    json = JSON.stringify(data) ?? "null";
  } catch {
    return "(unserializable response)";
  }
  if (json.length <= maxChars) return data;
  return `${json.slice(0, maxChars)}… (truncated — full response was ${json.length} chars; ${hint})`;
}
