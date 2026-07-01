/**
 * external-data-sources Slice 3 — the THIN EFFECTFUL wrapper the renderer host
 * (`buildPlanFromPage`) calls to hydrate api-kind bindings. Everything testable
 * is elsewhere: request building/retries/caching in the pure `fetch.ts`, param
 * resolution + row flattening in the pure `bind.ts`. This module only owns the
 * effects: D1 store reads, secret decryption (KEK from the Worker env), and a
 * Workers-backed `ApiCache`.
 *
 * SECURITY: the decrypted secret exists only inside `fetchApiData` — it goes
 * into `fetchSource` (server-side) and is never returned; only MAPPED response
 * values reach the page (USER DECISION: the key never touches the browser).
 *
 * GRACEFUL: every export resolves to null/[] on ANY failure (missing source,
 * bad KEK, upstream down) — the renderer shows placeholder/empty, never 500s.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  getDataSource,
  listDataSourceRequests,
  decryptSourceSecret,
} from "@/db/data-source-store";
import {
  fetchSource,
  createMemoryCache,
  type ApiCache,
} from "@/lib/data-sources/fetch";
import {
  resolveBindingParams,
  flattenByPaths,
  apiListElements,
  listPaths,
  type ApiParamSpec,
} from "@/lib/data-sources/bind";
import type { AuthType, HttpMethod } from "@/lib/data-sources/validate";
import type { ListSource } from "@/lib/render/tree";

/** The api-source fields shared by `BindingRef.source` and `ListSource`. */
export type ApiSourceRef = {
  sourceId?: string;
  requestId?: string;
  params?: ApiParamSpec;
};

/** Read the secret-box KEK (CMS_AUTH_SECRET) from the Worker env. */
async function kek(): Promise<string> {
  const { env } = await getCloudflareContext({ async: true });
  const e = env as unknown as Record<string, unknown>;
  return typeof e.CMS_AUTH_SECRET === "string" ? e.CMS_AUTH_SECRET : "";
}

// ── ApiCache impl ────────────────────────────────────────────────────────────
// Workers Cache API (`caches.default`) keyed by a synthetic internal URL per
// cache key; TTL rides on Cache-Control. Zero-config (no KV binding needed).
// `next dev` (node) has no caches.default → module-level memory cache instead.
// ponytail: Slice-7 purge will bump the fetch engine's cacheVersion rather than
// enumerate entries — this impl needs no delete support until then.

const CACHE_URL_PREFIX = "https://bizbee-api-cache.internal/";

let memoryFallback: ApiCache | null = null;

function getApiCache(): ApiCache {
  const cs = (globalThis as { caches?: { default?: Cache } }).caches;
  const c = cs?.default;
  if (c) {
    return {
      async get(key) {
        const hit = await c.match(CACHE_URL_PREFIX + encodeURIComponent(key));
        return hit ? hit.text() : null;
      },
      async put(key, value, ttlSec) {
        await c.put(
          CACHE_URL_PREFIX + encodeURIComponent(key),
          new Response(value, {
            headers: { "cache-control": `public, max-age=${Math.max(1, ttlSec)}` },
          }),
        );
      },
    };
  }
  return (memoryFallback ??= createMemoryCache());
}

// ── Fetch + map ──────────────────────────────────────────────────────────────

/**
 * Load the source + saved request, decrypt the secret, resolve `{placeholder}`
 * params from the block's props, and run the central fetch. Returns the parsed
 * JSON response, or undefined on any failure (never throws).
 */
async function fetchApiData(
  ref: ApiSourceRef,
  blockProps: Record<string, unknown> | undefined,
  locale: string,
  fallback: string,
): Promise<unknown | undefined> {
  try {
    if (!ref.sourceId || !ref.requestId) return undefined;
    const source = await getDataSource(ref.sourceId);
    if (!source) return undefined;
    const request = (await listDataSourceRequests(ref.sourceId)).find(
      (r) => r.id === ref.requestId,
    );
    if (!request) return undefined;

    const secret = source.hasSecret
      ? await decryptSourceSecret(ref.sourceId, await kek())
      : null;
    const params = resolveBindingParams(ref.params, blockProps, locale, fallback);

    const res = await fetchSource(
      {
        id: source.id,
        baseUrl: source.baseUrl,
        authType: source.authType as AuthType,
        authParam: source.authParam,
        secret,
      },
      {
        id: request.id,
        method: request.method as HttpMethod,
        path: request.path,
        query: request.query,
        bodyTemplate: request.bodyTemplate,
        cacheEnabled: request.cacheEnabled,
        cacheTtlSec: request.cacheTtlSec,
        retryable: request.retryable,
      },
      params,
      { cache: getApiCache() },
    );
    return res.ok ? res.data : undefined;
  } catch {
    return undefined; // graceful: bad KEK / store error / anything → placeholder
  }
}

/**
 * Single-item api binding → ONE flat row keyed by the map's dot-paths (the
 * shape `hydrateProps` consumes). An array response takes its first element
 * (mirrors the collection binding's first-match). null = graceful blank.
 */
export async function fetchApiBindingRow(
  source: ApiSourceRef,
  map: Record<string, string> | undefined,
  blockProps: Record<string, unknown> | undefined,
  locale: string,
  fallback: string,
): Promise<Record<string, unknown> | null> {
  const data = await fetchApiData(source, blockProps, locale, fallback);
  if (data === undefined) return null;
  const item = Array.isArray(data) ? data[0] : data;
  if (item == null || typeof item !== "object") return null;
  return flattenByPaths(item, Object.values(map ?? {}));
}

/**
 * api-kind List → flat rows (one per response element, keyed by the listMap
 * dot-paths + combobox identity paths) for `planList` to stamp. [] = graceful
 * empty (the List renders its empty-state slot).
 */
export async function fetchApiListRows(
  listSource: ListSource,
  listMap: Record<string, string> | undefined,
  blockProps: Record<string, unknown> | undefined,
  locale: string,
  fallback: string,
): Promise<Array<Record<string, unknown>>> {
  const data = await fetchApiData(listSource, blockProps, locale, fallback);
  if (data === undefined) return [];
  const paths = listPaths(listMap, listSource);
  return apiListElements(data, listSource.itemsPath).map((el) =>
    flattenByPaths(el, paths),
  );
}
