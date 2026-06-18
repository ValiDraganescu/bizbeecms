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
import {
  type ThemeOverrides,
  emptyThemeOverrides,
  normalizeThemeOverrides,
} from "@/lib/render/theme";
import {
  type SiteIdentity,
  emptySiteIdentity,
  normalizeSiteIdentity,
} from "@/lib/settings/site-settings";

const CONTENT_LOCALES_KEY = "content_locales";
const THEME_OVERRIDES_KEY = "theme_overrides";
const SITE_IDENTITY_KEY = "site_identity";

/** Upsert one settings row (key→JSON value). Shared by the typed accessors. */
async function upsertSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  const now = new Date();
  const existing = await db
    .select({ key: schema.siteSettings.key })
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.key, key))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schema.siteSettings)
      .set({ value, updatedAt: now })
      .where(eq(schema.siteSettings.key, key));
  } else {
    await db
      .insert(schema.siteSettings)
      .values({ key, value, updatedAt: now });
  }
}

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
  const normalized = normalizeContentLocales(config);
  await upsertSetting(CONTENT_LOCALES_KEY, JSON.stringify(normalized));
  return normalized;
}

/** Read the per-Site theme overrides (token→color), or `{}` if unset/garbage. */
export async function getThemeOverrides(): Promise<ThemeOverrides> {
  const db = await getDb();
  const rows = await db
    .select({ value: schema.siteSettings.value })
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.key, THEME_OVERRIDES_KEY))
    .limit(1);

  const raw = rows[0]?.value;
  if (!raw) return emptyThemeOverrides();
  try {
    return normalizeThemeOverrides(JSON.parse(raw));
  } catch {
    return emptyThemeOverrides();
  }
}

/** Upsert the theme overrides (normalized — only known tokens + safe colors). */
export async function setThemeOverrides(
  overrides: unknown,
): Promise<ThemeOverrides> {
  const normalized = normalizeThemeOverrides(overrides);
  await upsertSetting(THEME_OVERRIDES_KEY, JSON.stringify(normalized));
  return normalized;
}

/** Read the per-Site brand/design/AI-persona identity, or empty if unset. */
export async function getSiteIdentity(): Promise<SiteIdentity> {
  const db = await getDb();
  const rows = await db
    .select({ value: schema.siteSettings.value })
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.key, SITE_IDENTITY_KEY))
    .limit(1);

  const raw = rows[0]?.value;
  if (!raw) return emptySiteIdentity();
  try {
    return normalizeSiteIdentity(JSON.parse(raw));
  } catch {
    return emptySiteIdentity();
  }
}

/** Upsert the Site identity (normalized — trimmed + length-bounded fields). */
export async function setSiteIdentity(identity: unknown): Promise<SiteIdentity> {
  const normalized = normalizeSiteIdentity(identity);
  await upsertSetting(SITE_IDENTITY_KEY, JSON.stringify(normalized));
  return normalized;
}
