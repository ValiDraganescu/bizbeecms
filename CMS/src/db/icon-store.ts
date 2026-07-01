/**
 * Icon resolution + D1 cache (icon-sets epic) — the IMPURE edge.
 *
 * Resolves `{set, name}` icons to normalized inline SVG, reading the `icon_cache`
 * table first and falling back to the Iconify API on a miss (then caching the
 * result, including a negative "" entry for a confirmed-absent icon). The pure
 * parsing / URL-building / SVG-normalization lives in `lib/render/icons.ts`; this
 * module owns the D1 + network I/O so the render walk stays pure + node-testable.
 *
 * Entry point: `resolveIcons(set, names)` → `Map<name, svg>`. The render host
 * (buildPlanFromPage) calls it ONCE per page with every distinct icon name, then
 * the sync walk reads the map — the same hydrate-before-walk seam Lists use.
 */
import { inArray, sql } from "drizzle-orm";
import { getDb, schema, type Db } from "../lib/ports/db.ts";
import {
  isValidIconSet,
  isValidIconName,
  collectIconNames,
  iconifySvgUrl,
  iconifySearchUrl,
  normalizeIconSvg,
} from "../lib/render/icons.ts";
import { listComponents } from "./component-store.ts";

/** Cache key for one icon: "{set}/{name}". */
function cacheKey(set: string, name: string): string {
  return `${set}/${name}`;
}

/** How long to trust the Iconify fetch before giving up (ms). */
const FETCH_TIMEOUT_MS = 4000;

/**
 * Resolve a batch of icon names against `set` into normalized inline SVG.
 * Returns a Map keyed by NAME (not the composite key) → svg string. A name that
 * can't be resolved (invalid, network failure, or absent in the set) is simply
 * absent from the map, so the caller renders nothing for it.
 *
 * Reads D1 cache for all names in one query, fetches only the misses from
 * Iconify (concurrently), normalizes, and writes both hits and negative misses
 * back. Never throws — any failure degrades to "this icon didn't resolve".
 */
export async function resolveIcons(
  set: string,
  names: Iterable<string>,
  injectedDb?: Db,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!isValidIconSet(set)) return out;

  const wanted = [...new Set([...names])].filter(isValidIconName);
  if (wanted.length === 0) return out;

  let db: Db;
  try {
    db = injectedDb ?? (await getDb());
  } catch {
    return out; // no D1 binding (e.g. some build/test env) — resolve nothing.
  }

  const keys = wanted.map((n) => cacheKey(set, n));
  const keyToName = new Map(wanted.map((n) => [cacheKey(set, n), n]));

  // 1) Read everything we already have.
  let cached: { key: string; svg: string }[] = [];
  try {
    cached = await db
      .select({ key: schema.iconCache.key, svg: schema.iconCache.svg })
      .from(schema.iconCache)
      .where(inArray(schema.iconCache.key, keys));
  } catch {
    cached = [];
  }
  const have = new Set<string>();
  for (const row of cached) {
    have.add(row.key);
    const name = keyToName.get(row.key);
    if (name && row.svg) out.set(name, row.svg); // "" = negative cache → skip
  }

  // 2) Fetch the misses from Iconify, normalize, collect for write-back.
  const misses = wanted.filter((n) => !have.has(cacheKey(set, n)));
  if (misses.length > 0) {
    const fetched = await Promise.all(misses.map((name) => fetchOne(set, name)));
    const now = new Date();
    const rows = fetched.map(({ name, svg }) => ({
      key: cacheKey(set, name),
      svg, // normalized SVG, or "" for a confirmed miss
      updatedAt: now,
    }));
    for (const { name, svg } of fetched) if (svg) out.set(name, svg);
    // 3) Persist (best-effort; a cache write failure must not fail the render).
    try {
      // onConflictDoUpdate keeps the cache fresh if two renders race a miss.
      await db
        .insert(schema.iconCache)
        .values(rows)
        .onConflictDoUpdate({
          target: schema.iconCache.key,
          set: { svg: sql`excluded.svg`, updatedAt: now },
        });
    } catch {
      /* ignore cache write failures */
    }
  }

  return out;
}

/**
 * Search the icon set for names matching `query` via the Iconify search API.
 * Returns up to `limit` icon names (bare, no set prefix). Never throws — a bad
 * set / network error / unexpected payload yields an empty list.
 */
export async function searchIcons(
  set: string,
  query: string,
  limit = 48,
): Promise<string[]> {
  if (!isValidIconSet(set) || typeof query !== "string" || query.trim() === "") return [];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(iconifySearchUrl(set, query, limit), { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return [];
    const data = (await res.json()) as { icons?: unknown };
    if (!Array.isArray(data.icons)) return [];
    // Iconify returns full ids ("lucide:calendar"); strip the set prefix and keep
    // only names that belong to the requested set + validate.
    const prefix = `${set}:`;
    const names: string[] = [];
    for (const id of data.icons) {
      if (typeof id !== "string") continue;
      const name = id.startsWith(prefix) ? id.slice(prefix.length) : id;
      if (isValidIconName(name) && !names.includes(name)) names.push(name);
    }
    return names;
  } catch {
    return [];
  }
}

/**
 * Audit: which icon names referenced by components DON'T exist in `targetSet`?
 * Scans every component's tree for literal `{{icon "name"}}` slots, resolves the
 * union against `targetSet`, and reports the names that fail to resolve plus the
 * components that use each. Advisory only (used after a set switch). Dynamic
 * `{{icon prop}}` names live in page block props and aren't covered here — the
 * report says so. Never throws.
 */
export async function auditMissingIcons(
  targetSet: string,
): Promise<{ ok: boolean; set: string; missing: { name: string; components: string[] }[] }> {
  const set = targetSet;
  if (!isValidIconSet(set)) return { ok: false, set, missing: [] };
  try {
    const components = await listComponents();
    // name → components that reference it
    const refs = new Map<string, Set<string>>();
    for (const c of components) {
      const names = new Set<string>();
      // `tree` is the stringified TreeNode JSON; literal {{icon "x"}} slots survive
      // parsing as text, so scanning the JSON string catches them all.
      collectIconNames(typeof c.tree === "string" ? c.tree : "", names);
      for (const n of names) {
        if (!refs.has(n)) refs.set(n, new Set());
        refs.get(n)!.add(c.name);
      }
    }
    if (refs.size === 0) return { ok: true, set, missing: [] };

    const resolved = await resolveIcons(set, refs.keys());
    const missing: { name: string; components: string[] }[] = [];
    for (const [name, comps] of refs) {
      if (!resolved.get(name)) missing.push({ name, components: [...comps] });
    }
    return { ok: true, set, missing };
  } catch {
    return { ok: false, set, missing: [] };
  }
}

/** Fetch + normalize one icon; "" svg means confirmed-absent (negative cache). */
async function fetchOne(set: string, name: string): Promise<{ name: string; svg: string }> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(iconifySvgUrl(set, name), { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    // Iconify returns 404 (sometimes a 404 SVG body) for an unknown icon → negative cache.
    if (!res.ok) return { name, svg: "" };
    const raw = await res.text();
    const svg = normalizeIconSvg(raw);
    return { name, svg: svg ?? "" };
  } catch {
    // Network error / abort: DON'T negative-cache a transient failure as ""...
    // returning "" here would persist it. We still return "" so this render skips
    // the icon, but write-back of "" is acceptable — a later set change or cache
    // bust re-attempts. Keep it simple. ponytail: transient errors get negative-
    // cached; acceptable since a missing icon is non-fatal and rare.
    return { name, svg: "" };
  }
}
