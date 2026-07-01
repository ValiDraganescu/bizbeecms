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
import { getDb, schema, type Db } from "../lib/ports/db.ts";
import {
  type ContentLocales,
  defaultContentLocales,
  normalizeContentLocales,
} from "../lib/render/localize.ts";
import {
  type ThemeOverrides,
  emptyThemeOverrides,
  normalizeThemeOverrides,
} from "../lib/render/theme.ts";
import {
  type SiteIdentity,
  emptySiteIdentity,
  normalizeSiteIdentity,
} from "../lib/settings/site-settings.ts";
import { DEFAULT_ICON_SET, isValidIconSet } from "../lib/render/icons.ts";

const CONTENT_LOCALES_KEY = "content_locales";
const THEME_OVERRIDES_KEY = "theme_overrides";
const THEME_OVERRIDES_DARK_KEY = "theme_overrides_dark";
const SITE_IDENTITY_KEY = "site_identity";
const MODEL_CATALOG_KEY = "model_catalog";
const IMAGE_MODEL_KEY = "image_model";
const TRANSLATE_MODEL_KEY = "translate_model";
const IMAGE_GEN_MODEL_KEY = "image_gen_model";
const ICON_SET_KEY = "icon_set";

/** Upsert one settings row (key→JSON value). Shared by the typed accessors. */
async function upsertSetting(
  key: string,
  value: string,
  injectedDb?: Db,
): Promise<void> {
  const db = injectedDb ?? (await getDb());
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
export async function getContentLocales(
  injectedDb?: Db,
): Promise<ContentLocales> {
  const db = injectedDb ?? (await getDb());
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
  injectedDb?: Db,
): Promise<ContentLocales> {
  const normalized = normalizeContentLocales(config);
  await upsertSetting(CONTENT_LOCALES_KEY, JSON.stringify(normalized), injectedDb);
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

/** Read the per-Site DARK-mode theme overrides, or `{}` if unset/garbage. */
export async function getThemeOverridesDark(): Promise<ThemeOverrides> {
  const db = await getDb();
  const rows = await db
    .select({ value: schema.siteSettings.value })
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.key, THEME_OVERRIDES_DARK_KEY))
    .limit(1);

  const raw = rows[0]?.value;
  if (!raw) return emptyThemeOverrides();
  try {
    return normalizeThemeOverrides(JSON.parse(raw));
  } catch {
    return emptyThemeOverrides();
  }
}

/** Upsert the DARK-mode theme overrides (same normalization as light). */
export async function setThemeOverridesDark(
  overrides: unknown,
): Promise<ThemeOverrides> {
  const normalized = normalizeThemeOverrides(overrides);
  await upsertSetting(THEME_OVERRIDES_DARK_KEY, JSON.stringify(normalized));
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

/**
 * Cached AI model catalog (ai-assistant goal — searchable model picker). Stored
 * as ONE `site_settings` row (`model_catalog`) holding `{ fetchedAt, models }`,
 * refreshed lazily by `GET /api/chat/models` at most ~twice a day. Reuses the
 * generic settings table — no dedicated table needed (ponytail: one JSON row).
 */
export interface CatalogCache {
  /** epoch ms of the last successful CF API fetch. */
  fetchedAt: number;
  /** the parsed `CatalogModel[]` (see lib/chat/models.ts). */
  models: import("../lib/chat/models.ts").CatalogModel[];
}

/** Read the cached catalog, or null if unset / unparseable. */
export async function getModelCatalogCache(
  injectedDb?: Db,
): Promise<CatalogCache | null> {
  const db = injectedDb ?? (await getDb());
  const rows = await db
    .select({ value: schema.siteSettings.value })
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.key, MODEL_CATALOG_KEY))
    .limit(1);
  const raw = rows[0]?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CatalogCache;
    if (typeof parsed?.fetchedAt !== "number" || !Array.isArray(parsed?.models)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Upsert the cached catalog. */
export async function setModelCatalogCache(
  cache: CatalogCache,
  injectedDb?: Db,
): Promise<void> {
  await upsertSetting(MODEL_CATALOG_KEY, JSON.stringify(cache), injectedDb);
}

/**
 * Read the operator-selected image-description model id, or "" if unset (the
 * caller falls back to DEFAULT_IMAGE_MODEL and re-validates against the catalog).
 * Stored as a plain string (not JSON) — it's just an id.
 */
export async function getImageModel(injectedDb?: Db): Promise<string> {
  const db = injectedDb ?? (await getDb());
  const rows = await db
    .select({ value: schema.siteSettings.value })
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.key, IMAGE_MODEL_KEY))
    .limit(1);
  return rows[0]?.value ?? "";
}

/** Store the selected image-description model id. */
export async function setImageModel(id: string, injectedDb?: Db): Promise<void> {
  await upsertSetting(IMAGE_MODEL_KEY, id, injectedDb);
}

/**
 * Read the operator-selected TRANSLATION model id, or "" if unset (the caller
 * falls back to DEFAULT_TRANSLATE_MODEL and re-validates against the catalog).
 * Mirrors getImageModel — the model used by /api/translate. Plain string id.
 */
export async function getTranslateModel(injectedDb?: Db): Promise<string> {
  const db = injectedDb ?? (await getDb());
  const rows = await db
    .select({ value: schema.siteSettings.value })
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.key, TRANSLATE_MODEL_KEY))
    .limit(1);
  return rows[0]?.value ?? "";
}

/** Store the selected translation model id. */
export async function setTranslateModel(id: string, injectedDb?: Db): Promise<void> {
  await upsertSetting(TRANSLATE_MODEL_KEY, id, injectedDb);
}

/**
 * Read the per-Site icon SET id (Iconify prefix, e.g. "lucide", "tabler"), or the
 * default DEFAULT_ICON_SET when unset/invalid. Components reference icons by name
 * via `{{icon "name"}}`; the set chosen here decides which library those names
 * resolve against. Plain string id (icon-sets epic).
 */
export async function getIconSet(injectedDb?: Db): Promise<string> {
  const db = injectedDb ?? (await getDb());
  const rows = await db
    .select({ value: schema.siteSettings.value })
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.key, ICON_SET_KEY))
    .limit(1);
  const raw = rows[0]?.value;
  return raw && isValidIconSet(raw) ? raw : DEFAULT_ICON_SET;
}

/** Store the selected icon set id (validated by the route before it gets here). */
export async function setIconSet(set: string, injectedDb?: Db): Promise<void> {
  await upsertSetting(ICON_SET_KEY, set, injectedDb);
}

/**
 * Read the operator-selected image-GENERATION model id, or "" if unset (the caller
 * falls back to DEFAULT_IMAGE_GEN_MODEL and re-validates against the image-output
 * catalog). Mirrors getImageModel — used by the generate_image tool. Plain string.
 */
export async function getImageGenModel(injectedDb?: Db): Promise<string> {
  const db = injectedDb ?? (await getDb());
  const rows = await db
    .select({ value: schema.siteSettings.value })
    .from(schema.siteSettings)
    .where(eq(schema.siteSettings.key, IMAGE_GEN_MODEL_KEY))
    .limit(1);
  return rows[0]?.value ?? "";
}

/** Store the selected image-generation model id. */
export async function setImageGenModel(id: string, injectedDb?: Db): Promise<void> {
  await upsertSetting(IMAGE_GEN_MODEL_KEY, id, injectedDb);
}
