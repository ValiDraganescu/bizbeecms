/**
 * external-data-sources Slice 7 — cache-purge VERSION COUNTERS (pure).
 *
 * The Workers Cache-API `ApiCache` impl (hydrate.ts) cannot enumerate or
 * delete entries, so purging works by VERSIONING the cache key instead: the
 * fetch engine's `buildCacheKey` embeds `deps.cacheVersion`, and this module
 * composes that version from three counters — global + per-source +
 * per-request. Bumping any counter changes the composed version for its
 * scope, so every old entry in that scope simply stops being addressable
 * (and expires via its TTL). Cheap eviction, no key enumeration.
 *
 * Pure module: NO `@/` imports, node-tested (scripts/data-source-purge.test.mjs).
 * Persistence lives in settings-store (`api_cache_versions` JSON row).
 */

export type ApiCacheVersions = {
  /** bumped by "purge all API cache" — invalidates everything. */
  global: number;
  /** sourceId → counter; bumped by a per-source purge. */
  sources: Record<string, number>;
  /** requestId → counter; bumped by a per-request purge. */
  requests: Record<string, number>;
};

export function emptyCacheVersions(): ApiCacheVersions {
  return { global: 0, sources: {}, requests: {} };
}

function normCounter(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

function normMap(raw: unknown): Record<string, number> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = normCounter(v);
    if (n > 0) out[k] = n; // 0 is the implicit default — don't store it
  }
  return out;
}

/** Defensive parse of the stored JSON — garbage → fresh counters, never throws. */
export function normalizeCacheVersions(raw: unknown): ApiCacheVersions {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyCacheVersions();
  }
  const o = raw as Record<string, unknown>;
  return {
    global: normCounter(o.global),
    sources: normMap(o.sources),
    requests: normMap(o.requests),
  };
}

/**
 * The composed version string for one (source, request) fetch —
 * `<global>.<sourceV>.<requestV>`. Any scope bump changes it.
 */
export function cacheVersionFor(
  v: ApiCacheVersions,
  sourceId: string,
  requestId: string,
): string {
  return `${v.global}.${v.sources[sourceId] ?? 0}.${v.requests[requestId] ?? 0}`;
}

/**
 * Drop counters for a deleted source and/or deleted saved requests so the
 * `api_cache_versions` row doesn't accumulate dead keys. Returns the SAME
 * object when nothing was removed — callers skip the settings write then.
 * (Dropping a counter resets its scope's version to 0; ids are UUIDs and
 * never reused, so no live cache entry can be re-addressed by the reset.)
 */
export function pruneCounters(
  v: ApiCacheVersions,
  drop: { sourceId?: string; requestIds?: string[] },
): ApiCacheVersions {
  const reqIds = drop.requestIds ?? [];
  const dropSource = drop.sourceId != null && drop.sourceId in v.sources;
  const dropReqs = reqIds.some((id) => id in v.requests);
  if (!dropSource && !dropReqs) return v;
  const sources = { ...v.sources };
  if (drop.sourceId != null) delete sources[drop.sourceId];
  const requests = { ...v.requests };
  for (const id of reqIds) delete requests[id];
  return { global: v.global, sources, requests };
}

export function bumpGlobal(v: ApiCacheVersions): ApiCacheVersions {
  return { ...v, global: v.global + 1 };
}

export function bumpSource(v: ApiCacheVersions, sourceId: string): ApiCacheVersions {
  return {
    ...v,
    sources: { ...v.sources, [sourceId]: (v.sources[sourceId] ?? 0) + 1 },
  };
}

export function bumpRequest(v: ApiCacheVersions, requestId: string): ApiCacheVersions {
  return {
    ...v,
    requests: { ...v.requests, [requestId]: (v.requests[requestId] ?? 0) + 1 },
  };
}
