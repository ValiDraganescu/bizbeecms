/**
 * Pure redirect helpers (seo-robots).
 *
 * PURE — no D1/React/CF imports — so it's unit-testable under dep-free
 * `node --test` (project convention; see CAVEATS). The `(site)` catch-all
 * normalizes the incoming request path with `normalizeRedirectPath`, then hands
 * the store's rows (or a Map) to `lookupRedirect`; a hit becomes a 301/302
 * BEFORE the 404 render.
 *
 * Path matching is exact on the normalized path (no wildcards, no query) — the
 * common case is slug renames, which are 1:1. Redirect responses are non-200,
 * so the worker.ts edge-cache gate (GET-200-only) already skips them; this
 * module adds NO cache handling.
 */

/** A stored redirect row (subset the lookup needs). */
export interface RedirectRow {
  fromPath: string;
  toPath: string;
  status: number;
}

/** The resolved redirect the route acts on. */
export interface RedirectHit {
  toPath: string;
  status: 301 | 302;
}

/**
 * Normalize a URL path to the stored/lookup form:
 * - strip any origin, query string, and hash (match on the path only),
 * - URL-decode once (defensive; ignore malformed escapes),
 * - collapse repeated slashes, ensure a single leading slash,
 * - drop a trailing slash EXCEPT for the root `/`,
 * - lowercase is NOT applied — paths are case-sensitive by web convention.
 *
 * Returns "/" for an empty/whitespace path. Used both at insert time (store)
 * and at lookup time so both sides agree.
 */
export function normalizeRedirectPath(raw: string): string {
  if (typeof raw !== "string") return "/";
  // Drop origin if a full URL was passed, then query + hash.
  let p = raw.trim();
  const schemeMatch = p.match(/^[a-z][a-z0-9+.-]*:\/\/[^/]*(\/.*)?$/i);
  if (schemeMatch) p = schemeMatch[1] ?? "/";
  p = p.split("?")[0].split("#")[0];
  try {
    p = decodeURIComponent(p);
  } catch {
    // Malformed %-escape: keep the raw path rather than throw.
  }
  // Collapse // and ensure a single leading slash.
  p = "/" + p.replace(/^\/+/, "").replace(/\/{2,}/g, "/");
  // Drop trailing slash except root.
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

/** Clamp a stored status to a supported redirect status (301 default). */
function normalizeStatus(status: number): 301 | 302 {
  return status === 302 ? 302 : 301;
}

/**
 * Look up a redirect for an already-normalized request path.
 *
 * `rows` may be an array of RedirectRow or a Map keyed by normalized fromPath.
 * Returns the target (normalized toPath) + status, or null on a miss. Guards
 * self-redirects (from === to after normalization) — those would loop, so we
 * treat them as a miss (the store's auto-capture also drops self-redirects, but
 * this is a belt-and-braces guard for hand-added rows).
 */
export function lookupRedirect(
  requestPath: string,
  rows: RedirectRow[] | Map<string, RedirectRow>,
): RedirectHit | null {
  const from = normalizeRedirectPath(requestPath);
  const row = rows instanceof Map ? rows.get(from) : rows.find((r) => normalizeRedirectPath(r.fromPath) === from);
  if (!row) return null;
  const to = normalizeRedirectPath(row.toPath);
  if (to === from) return null; // self-redirect → loop; ignore
  return { toPath: to, status: normalizeStatus(row.status) };
}
