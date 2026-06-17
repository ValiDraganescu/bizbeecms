/**
 * D1 read/write for per-Site settings (Milestone 2, epic C1+).
 *
 * First use: the data-driven content-locale set. Stored as one `site_settings`
 * row keyed `content_locales` holding a JSON `{ default, locales[] }`. Reads are
 * defensive (bad/empty JSON → safe default config) via the pure
 * `normalizeContentLocales`; the resolution semantics live in
 * `lib/render/localize.ts` (pure, node-testable). Build-verified only — live D1
 * needs a real binding (HITL).
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "./index";
import {
  type ContentLocales,
  defaultContentLocales,
  normalizeContentLocales,
} from "@/lib/render/localize";

const CONTENT_LOCALES_KEY = "content_locales";

/** Read the per-Site content-locale config, or the safe default if unset. */
export async function getContentLocales(): Promise<ContentLocales> {
  const db = await getDb();
  const rows = await db
    .select({ value: schema.siteSettings.value })
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.key, CONTENT_LOCALES_KEY))
    .limit(1);

  const raw = rows[0]?.value;
  if (!raw) return defaultContentLocales();
  try {
    return normalizeContentLocales(JSON.parse(raw));
  } catch {
    return defaultContentLocales();
  }
}

/** Upsert the content-locale config (normalized before write). */
export async function setContentLocales(
  config: ContentLocales,
): Promise<ContentLocales> {
  const db = await getDb();
  const normalized = normalizeContentLocales(config);
  const value = JSON.stringify(normalized);
  const now = new Date();

  const existing = await db
    .select({ key: schema.siteSettings.key })
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.key, CONTENT_LOCALES_KEY))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schema.siteSettings)
      .set({ value, updatedAt: now })
      .where(eq(schema.siteSettings.key, CONTENT_LOCALES_KEY));
  } else {
    await db
      .insert(schema.siteSettings)
      .values({ key: CONTENT_LOCALES_KEY, value, updatedAt: now });
  }
  return normalized;
}
