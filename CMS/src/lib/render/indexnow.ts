/**
 * IndexNow — instant search-engine notification of published-content changes
 * (seo-robots goal, Sitemap track #2).
 *
 * IndexNow (indexnow.org) lets a site tell participating engines (Bing, Yandex,
 * Seznam, Naver — NOT Google, which retired sitemap ping in 2023 and doesn't
 * support IndexNow) that URLs changed, so they recrawl immediately instead of
 * on their own schedule. The protocol:
 *   1. The site owns a KEY (an opaque 8–128 hex-ish string) hosted at a text
 *      file returning exactly the key — proves ownership. The default name is
 *      `<origin>/<key>.txt`, but the spec lets you host it anywhere and point
 *      `keyLocation` at it. We serve it at a FIXED path (`INDEXNOW_KEY_PATH`)
 *      because Next's root optional-catch-all owns `/<anything>` and a dynamic
 *      `/[key].txt` route would collide with it.
 *   2. To notify, POST JSON `{ host, key, keyLocation, urlList }` to
 *      `https://api.indexnow.org/indexnow`. One POST can carry up to 10 000 URLs
 *      (we send far fewer — a single page's locale variants).
 *
 * This module is the PURE core (no fetch/D1/CF) — unit-tested with dep-free
 * `node --test`. The best-effort submit (fetch) lives in `indexnow-notify.ts`
 * so it stays out of the pure test harness, mirroring
 * edge-cache.ts ↔ purge-edge.ts.
 */

import { pagePathsByLocale, type PathPageRow } from "./localize-paths.ts";
import { createPathTranslator } from "./localize-paths.ts";

/** IndexNow keys are 8–128 chars from `[a-zA-Z0-9-]` (protocol spec). */
const KEY_RE = /^[a-zA-Z0-9-]{8,128}$/;

/**
 * Fixed path that serves the ownership key file (plaintext = the key). Used as
 * both the served route (`app/indexnow-key/route.ts`) and the `keyLocation`
 * IndexNow verifies against. A fixed path avoids colliding with the root
 * optional-catch-all; the spec permits any keyLocation on the host.
 */
export const INDEXNOW_KEY_PATH = "/indexnow-key";

/** Is `s` a well-formed IndexNow key? */
export function isValidIndexNowKey(s: unknown): s is string {
  return typeof s === "string" && KEY_RE.test(s);
}

/**
 * Generate a fresh IndexNow key: 32 lowercase hex chars from CSPRNG bytes.
 * Injectable RNG for deterministic tests; defaults to WebCrypto (present on
 * Workers and Node ≥ 20). PURE apart from the RNG.
 */
export function generateIndexNowKey(
  randomBytes: (n: number) => Uint8Array = defaultRandomBytes,
): string {
  const bytes = randomBytes(16);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function defaultRandomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

/** The IndexNow POST body for a batch of same-host URLs. */
export interface IndexNowSubmission {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

/**
 * Build the IndexNow POST body for `urls` (all absolute, all on `origin`).
 * Returns null when there's nothing to submit or the origin/key is unusable —
 * callers then skip the POST rather than send a malformed request. Dedupes
 * URLs and drops any not on `origin` (IndexNow rejects a mixed-host urlList).
 */
export function buildSubmission(
  origin: string,
  key: string,
  urls: string[],
): IndexNowSubmission | null {
  if (!isValidIndexNowKey(key)) return null;
  const trimmed = origin.trim().replace(/\/+$/, "");
  let host: string;
  try {
    host = new URL(trimmed).host;
  } catch {
    return null;
  }
  const prefix = trimmed + "/";
  const seen = new Set<string>();
  const urlList: string[] = [];
  for (const u of urls) {
    // Keep only well-formed, same-host absolute URLs; dedupe.
    if (u !== trimmed && !u.startsWith(prefix)) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    urlList.push(u);
  }
  if (urlList.length === 0) return null;
  return {
    host,
    key,
    keyLocation: `${trimmed}${INDEXNOW_KEY_PATH}`,
    urlList,
  };
}

/**
 * Every absolute URL of ONE page across all content locales — what IndexNow
 * should be told about when that page publishes/unpublishes/deletes or its
 * path changes. Built from the same machinery the sitemap uses
 * (`pagePathsByLocale` + a path translator), so the URLs match the sitemap's
 * exactly. Returns [] for wildcard `:param` pages (no enumerable URL — same as
 * the sitemap) or when the path isn't reconstructible. PURE.
 */
export function pageUrlsAllLocales(
  origin: string,
  rows: PathPageRow[],
  pageId: string,
  defaultLocale: string,
  codes: string[],
): string[] {
  const trimmed = origin.trim().replace(/\/+$/, "");
  if (!trimmed) return [];
  const translate = createPathTranslator(rows, defaultLocale);
  const byLocale = pagePathsByLocale(rows, pageId, {}, defaultLocale, codes, translate);
  if (!byLocale) return [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const code of codes) {
    const path = byLocale[code];
    if (path === undefined) continue;
    const url = trimmed + path;
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}
