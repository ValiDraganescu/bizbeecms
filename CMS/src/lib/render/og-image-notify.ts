/**
 * OG-image autogen publish/delete wiring (seo-robots — OG track item 3/4).
 *
 * The CF-coupled shell that fires page screenshots into R2 as the og:image
 * FALLBACK. Kept OUT of the pure test harness exactly like `indexnow-notify.ts`
 * (the pure decision lives in `og-image.ts` `planOgScreenshots` /
 * `ogImageKeysForLocales`, dep-free node-tested).
 *
 * ── On publish (`generateOgImagesForPage`) ──
 * For each configured content locale, IF there's no manual per-locale metaImage
 * AND no auto screenshot already exists → take at most one screenshot of the
 * PUBLIC page URL and store it at `og/<id>.<locale>.png`. Idempotent (never
 * regenerates — the explicit SEO-tab button does that), manual-upload-wins
 * (never runs when the operator supplied an image).
 *
 * BEST-EFFORT by design (purge-edge / IndexNow pattern): a missing browser
 * binding (Free plan / local dev), missing origin, R2 error, or screenshot
 * failure must NEVER fail or delay the publish. Everything is swallowed and the
 * whole batch runs under `ctx.waitUntil` so it settles after the response
 * flushes.
 *
 * ── On delete (`deleteOgImagesForPage`) ──
 * Remove every `og/<id>.<locale>.png` the page could have carried (Storage has
 * no list, so we derive the keys from the configured locales). Best-effort.
 */
import { waitUntilOrInline } from "@/lib/cf/wait-until";

import { getDb } from "@/db";
import { page as pageTable } from "@/db/schema";
import { getContentLocales } from "@/db/settings-store";
import { getStorage } from "@/lib/ports/storage";
import { resolveSiteOrigin } from "./site-origin.ts";
import { createPathTranslator, pagePathsByLocale, type PathPageRow } from "./localize-paths.ts";
import {
  ogImageKey,
  ogImageKeysForLocales,
  planOgScreenshots,
  screenshotPageToR2,
} from "./og-image.ts";

/** Load the columns the OG planner needs for one page across all locales. */
async function loadOgContext(pageId: string): Promise<{
  urlsByLocale: Record<string, string>;
  manualImageByLocale: Record<string, string>;
  locales: string[];
} | null> {
  const db = await getDb();
  const [rows, contentLocales, origin] = await Promise.all([
    db
      .select({
        id: pageTable.id,
        slug: pageTable.slug,
        parentPageId: pageTable.parentPageId,
        localizedSlugs: pageTable.localizedSlugs,
        metaImage: pageTable.metaImage,
      })
      .from(pageTable),
    getContentLocales(db),
    resolveSiteOrigin(),
  ]);
  if (!origin) return null;
  const codes = contentLocales.locales;
  const translate = createPathTranslator(rows as PathPageRow[], contentLocales.default);
  const byLocale = pagePathsByLocale(
    rows as PathPageRow[],
    pageId,
    {},
    contentLocales.default,
    codes,
    translate,
  );
  // Wildcard / unreconstructible page → no enumerable URLs → nothing to shoot.
  if (!byLocale) return { urlsByLocale: {}, manualImageByLocale: {}, locales: codes };

  const trimmed = origin.trim().replace(/\/+$/, "");
  const urlsByLocale: Record<string, string> = {};
  for (const [code, path] of Object.entries(byLocale)) urlsByLocale[code] = trimmed + path;

  const meta = rows.find((r) => r.id === pageId)?.metaImage;
  return { urlsByLocale, manualImageByLocale: parseImageMap(meta), locales: codes };
}

function parseImageMap(json: string | null | undefined): Record<string, string> {
  try {
    const v = JSON.parse(String(json ?? "{}"));
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const out: Record<string, string> = {};
      for (const [k, val] of Object.entries(v)) if (typeof val === "string") out[k] = val;
      return out;
    }
  } catch {
    /* corrupt JSON → no manual images */
  }
  return {};
}

/**
 * Publish hook: best-effort background OG screenshots for a page's locales that
 * have neither a manual metaImage nor an existing auto screenshot. Never throws;
 * fire-and-forget under `ctx.waitUntil`.
 */
export async function generateOgImagesForPage(pageId: string): Promise<void> {
  const work = (async () => {
    try {
      const cfg = await loadOgContext(pageId);
      if (!cfg) return;
      const storage = await getStorage();
      // Probe R2 for the auto key of each locale that COULD be screenshotted
      // (no manual image). A manual-image locale is skipped by the planner
      // regardless, so don't waste a probe on it.
      const existingKeys: string[] = [];
      const probeLocales = cfg.locales.filter(
        (loc) => !(cfg.manualImageByLocale[loc] ?? "").trim(),
      );
      await Promise.all(
        probeLocales.map(async (loc) => {
          const key = ogImageKey(pageId, loc);
          try {
            const obj = await storage.get(key);
            if (obj) existingKeys.push(key);
          } catch {
            /* probe error → treat as absent; a re-shoot just overwrites in place */
          }
        }),
      );
      const jobs = planOgScreenshots({
        pageId,
        urlsByLocale: cfg.urlsByLocale,
        manualImageByLocale: cfg.manualImageByLocale,
        existingKeys,
      });
      // Sequential: Browser Rendering concurrency is scarce — one shot at a time.
      for (const job of jobs) {
        await screenshotPageToR2(job.pageUrl, job.key);
      }
    } catch {
      /* best-effort — never fail the publish */
    }
  })();
  waitUntilOrInline(work);
}

/**
 * EXPLICIT regenerate (SEO-tab button): force a fresh screenshot for ONE
 * page×locale, SKIPPING the existing-key idempotency probe — this is the
 * "refresh after a redesign" path, unlike the publish hook which only fills
 * gaps. Runs SYNCHRONOUSLY (the operator is waiting for a result) and returns a
 * structured outcome with a STABLE `code` the SEO tab localizes.
 *
 * Refuses when a manual per-locale metaImage exists (`manualWins`) — an upload
 * always beats autogen, so regenerating would produce a screenshot nothing uses.
 */
export type OgRegenerateResult =
  | { ok: true; key: string }
  | { ok: false; code: "manualWins" | "noUrl" | "noBinding" | "noOrigin" | "error"; detail?: string };

export async function regenerateOgImageForPage(
  pageId: string,
  locale: string,
): Promise<OgRegenerateResult> {
  try {
    const cfg = await loadOgContext(pageId);
    if (!cfg) return { ok: false, code: "noOrigin" };
    if ((cfg.manualImageByLocale[locale] ?? "").trim()) {
      return { ok: false, code: "manualWins" };
    }
    const pageUrl = cfg.urlsByLocale[locale];
    if (!pageUrl) return { ok: false, code: "noUrl" };

    const key = ogImageKey(pageId, locale);
    const shot = await screenshotPageToR2(pageUrl, key);
    if (shot.ok) return { ok: true, key };
    if (shot.reason === "no-binding") return { ok: false, code: "noBinding" };
    if (shot.reason === "no-origin") return { ok: false, code: "noOrigin" };
    return { ok: false, code: "error", detail: shot.detail };
  } catch (e) {
    return { ok: false, code: "error", detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Delete hook: remove every auto OG screenshot a page could have had. Called
 * BEFORE (or alongside) the page delete — the keys are derived from the
 * configured locales, not the page row, so it's safe either way. Best-effort.
 */
export async function deleteOgImagesForPage(pageId: string): Promise<void> {
  const work = (async () => {
    try {
      const db = await getDb();
      const contentLocales = await getContentLocales(db);
      const storage = await getStorage();
      const keys = ogImageKeysForLocales(pageId, contentLocales.locales);
      await Promise.all(
        keys.map((key) => storage.delete(key).catch(() => undefined)),
      );
    } catch {
      /* best-effort */
    }
  })();
  waitUntilOrInline(work);
}
