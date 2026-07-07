/**
 * OG-image autogen — Cloudflare Browser Rendering screenshots the top of a
 * published page as the og:image FALLBACK (used only when no manual per-locale
 * metaImage exists). This module owns the PURE pieces (the R2 key scheme +
 * dimensions + a locale/id sanitizer) plus the spike that screenshots ONE page.
 *
 * ── DECISION (2026-07-07): `browser` Worker binding, NOT the REST API ──
 * Two ways to drive Browser Rendering:
 *   (a) `browser` Worker binding + `@cloudflare/puppeteer` — declared in
 *       wrangler.jsonc as `"browser": { "binding": "BROWSER" }`, driven in-Worker
 *       via `puppeteer.launch(env.BROWSER)`. No secret, no per-Site provision —
 *       it's an ACCOUNT-level product exactly like the `AI` and `IMAGES` bindings
 *       already wired here (the deployer needs ZERO override).
 *   (b) Browser Rendering REST API — needs a Cloudflare account API token with
 *       the Browser Rendering scope, injected per-Site as a Worker SECRET through
 *       the deployer (the OPENROUTER_API_KEY plumbing). More moving parts, another
 *       secret to rotate, and a raw fetch to `/accounts/<id>/browser-rendering`.
 * We take (a): it's the CF-native platform feature, needs no secret pipeline, and
 * matches how AI/IMAGES are already bound. Both require a PAID Workers plan
 * (Browser Rendering is not on Free) and both share the same session/concurrency
 * limits (a small pool of concurrent browser sessions per account, ~60s cap per
 * session, cold-start on first launch) — so screenshots MUST be off the hot path,
 * best-effort, and never block a publish (the publish-wiring task uses
 * ctx.waitUntil, mirroring purge-edge / IndexNow).
 *
 * Cost/limits notes for the wiring tasks:
 *   - PAID plan only — `getBrowser()` returns null when the binding is absent, so
 *     autogen degrades to "no fallback og:image" (a manual metaImage still works).
 *   - Concurrency is the scarce resource. Generate at most one screenshot per
 *     publish per locale, only when nothing exists yet (idempotent), and skip if a
 *     session can't be acquired — never queue/retry on the request path.
 *   - Local dev has no binding → this spike SKIPS SILENTLY (returns a skip result).
 */

/** OG card dimensions the platforms expect (Facebook/LinkedIn/Twitter large). */
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const OG_IMAGE_CONTENT_TYPE = "image/png";

/**
 * R2 key for a page×locale auto screenshot. Kept in the `og/` prefix — a
 * DISTINCT namespace from user uploads (`assets/…`), so an autogen image can
 * never collide with or overwrite a media-library upload (the "auto stored
 * separately, upload always wins" contract). id/locale are sanitized so a weird
 * value can't traverse or produce a malformed key.
 */
export function ogImageKey(pageId: string, locale: string): string {
  const id = sanitizeSegment(pageId);
  const loc = sanitizeSegment(locale);
  return `og/${id}.${loc}.png`;
}

/** True only for keys this module mints (guards a future serve route vs traversal). */
export function isOgImageKey(key: string): boolean {
  return /^og\/[a-z0-9][a-z0-9_-]*\.[a-z0-9_-]+\.png$/.test(key);
}

/** Lower-case, keep [a-z0-9_-], collapse the rest — never empty (falls back to "x"). */
function sanitizeSegment(value: string): string {
  const s = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return s || "x";
}

/**
 * Public serve path for an auto OG screenshot. Lives under `/api` (NOT a
 * top-level `/og/...` route) because the `(site)` optional catch-all shadows
 * every arbitrary top-level path — see the routing CAVEAT. `og/<id>.<loc>.png`
 * (the R2 key) is served at `/api/og/<id>.<loc>.png`; the route strips the
 * `/api/` prefix back to the key and guards it with `isOgImageKey`.
 */
export const OG_IMAGE_ROUTE_PREFIX = "/api/";

/** Public URL for an auto OG screenshot's R2 key (`og/<id>.<loc>.png`). */
export function ogImageUrl(key: string): string {
  return OG_IMAGE_ROUTE_PREFIX + key;
}

/**
 * PURE og:image precedence for a page×locale:
 *   1. a MANUAL per-locale metaImage (a media upload) ALWAYS wins,
 *   2. else the auto screenshot `og/<id>.<locale>.png` IF it exists in R2,
 *   3. else none (undefined → the card carries no image).
 * Returns an ABSOLUTE URL when `origin` is known (social scrapers need absolute
 * og:image), else the root-relative form (Next's metadataBase absolutizes it in
 * prod; fine for local dev). The auto-existence check is the caller's job (an R2
 * lookup off the metadata path, only when there's no manual image) — this stays
 * pure/testable and never touches R2.
 */
export function resolveOgImageUrl(input: {
  manualImage?: string;
  autoExists?: boolean;
  pageId: string;
  locale: string;
  origin?: string | null;
}): string | undefined {
  const manual = typeof input.manualImage === "string" ? input.manualImage.trim() : "";
  if (manual) return absolutize(manual, input.origin);
  if (input.autoExists) {
    return absolutize(ogImageUrl(ogImageKey(input.pageId, input.locale)), input.origin);
  }
  return undefined;
}

/** Make a root-relative URL absolute against `origin`; leave already-absolute untouched. */
function absolutize(url: string, origin?: string | null): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (!origin) return url;
  return origin.replace(/\/+$/, "") + (url.startsWith("/") ? url : "/" + url);
}

/**
 * PURE planner for the publish-wiring hook: given a page's per-locale absolute
 * URLs, its MANUAL per-locale metaImage map, and the set of auto keys that
 * ALREADY exist in R2, decide which (locale → screenshot job) to run.
 *
 * A screenshot job is emitted for a locale ONLY when:
 *   1. we have an absolute page URL for it (wildcard/unreconstructible → skip),
 *   2. there is NO manual per-locale metaImage (a manual upload always wins —
 *      autogen must never run when the operator supplied an image), and
 *   3. the auto key `og/<id>.<locale>.png` does NOT already exist (idempotent —
 *      publish regenerates nothing; the explicit regenerate button does that).
 *
 * Returns at most one job per locale. PURE — the caller does the R2 existence
 * probe (to build `existingKeys`) and fires `screenshotPageToR2` per job.
 */
export interface OgScreenshotJob {
  locale: string;
  pageUrl: string;
  key: string;
}

export function planOgScreenshots(input: {
  pageId: string;
  urlsByLocale: Record<string, string>;
  manualImageByLocale: Record<string, string>;
  existingKeys: Iterable<string>;
}): OgScreenshotJob[] {
  const existing = new Set(input.existingKeys);
  const jobs: OgScreenshotJob[] = [];
  for (const [locale, pageUrl] of Object.entries(input.urlsByLocale)) {
    if (!pageUrl) continue;
    const manual =
      typeof input.manualImageByLocale[locale] === "string"
        ? input.manualImageByLocale[locale].trim()
        : "";
    if (manual) continue; // a manual upload always wins — never autogen over it.
    const key = ogImageKey(input.pageId, locale);
    if (existing.has(key)) continue; // already generated — publish is idempotent.
    jobs.push({ locale, pageUrl, key });
  }
  return jobs;
}

/** Every auto OG key a page COULD have across `locales` (for delete cleanup). */
export function ogImageKeysForLocales(pageId: string, locales: Iterable<string>): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const locale of locales) {
    const key = ogImageKey(pageId, locale);
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

export type OgSpikeResult =
  | { ok: true; key: string; bytes: number }
  | { ok: false; reason: "no-binding" | "no-origin" | "error"; detail?: string };

/**
 * SPIKE: screenshot the top of ONE published page (1200×630 viewport) and write
 * it to R2 at `og/<pageId>.<locale>.png`. Best-effort and self-contained — it
 * resolves the browser binding + storage itself and returns a structured result
 * instead of throwing, so a caller (the future publish hook) can `waitUntil` it
 * and ignore failures.
 *
 * Dependency-light on purpose: `@cloudflare/puppeteer` is imported DYNAMICALLY so
 * the module (and its pure exports above) load fine when the package/binding is
 * absent — the spike just returns `{ ok:false, reason:"no-binding" }`. Install
 * `@cloudflare/puppeteer` + add the `BROWSER` binding to wrangler.jsonc to arm it
 * on a deployed (paid) Site; skips silently in local dev.
 *
 * ponytail: spike scope — screenshots the PUBLIC page URL over the network (needs
 * a reachable origin). The wiring task decides whether to pass an admin-preview
 * URL vs the public URL; keeping it URL-driven means zero coupling to the render
 * pipeline here.
 */
export async function screenshotPageToR2(
  pageUrl: string,
  key: string,
): Promise<OgSpikeResult> {
  if (!pageUrl) return { ok: false, reason: "no-origin" };

  let browserBinding: unknown;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    browserBinding = (env as { BROWSER?: unknown }).BROWSER;
  } catch (e) {
    return { ok: false, reason: "error", detail: errText(e) };
  }
  if (!browserBinding) return { ok: false, reason: "no-binding" };

  try {
    // Dynamic import via a NON-LITERAL specifier so tsc/the bundler don't try to
    // statically resolve `@cloudflare/puppeteer` (it's an optional dep — not
    // installed until a Site arms OG autogen). Install it + add the `BROWSER`
    // binding to wrangler.jsonc to enable; absent → the outer no-binding guard
    // already returned, so this line only runs when the binding IS present.
    const puppeteerModule = "@cloudflare/puppeteer";
    const puppeteer = (await import(/* webpackIgnore: true */ puppeteerModule)).default as {
      launch(b: unknown): Promise<{
        newPage(): Promise<{
          setViewport(v: { width: number; height: number }): Promise<void>;
          goto(url: string, o?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
          screenshot(o?: { type?: string }): Promise<Uint8Array>;
        }>;
        close(): Promise<void>;
      }>;
    };
    const browser = await puppeteer.launch(browserBinding);
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT });
      await page.goto(pageUrl, { waitUntil: "networkidle0", timeout: 30_000 });
      const shot = await page.screenshot({ type: "png" });
      const bytes = new Uint8Array(shot);

      const { getStorage } = await import("@/lib/ports/storage");
      const storage = await getStorage();
      await storage.put(key, bytes.buffer as ArrayBuffer, {
        contentType: OG_IMAGE_CONTENT_TYPE,
      });
      return { ok: true, key, bytes: bytes.byteLength };
    } finally {
      await browser.close();
    }
  } catch (e) {
    return { ok: false, reason: "error", detail: errText(e) };
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
