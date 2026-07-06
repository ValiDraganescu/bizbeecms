/**
 * Per-Site content-locale resolution (Milestone 2, epic C1) — PURE module.
 *
 * Content locales are DATA-DRIVEN per Site (an arbitrary set like en/fi/sv/de),
 * DISTINCT from the fixed EN/FI/ET admin-UI locale set. Localized content is
 * stored INLINE in the artifact/block data as "locale objects": a plain object
 * whose keys are all valid locale codes, e.g.
 *
 *   { "en": "Welcome", "fi": "Tervetuloa" }
 *
 * At render time we walk a value of any shape and replace every locale object
 * (at any depth) with the plain value for the active locale, falling back to
 * the site default locale, then to any present value. A string/number that is
 * NOT a locale object passes through unchanged, so authors can mix localized
 * and non-localized props freely.
 *
 * Mined from `../aicms` (translation_resolver + locale_settings), adapted to the
 * bizbeecms artifact model. Kept React/D1/CF-free so it is node-testable
 * (project test convention; see CAVEATS).
 */

// ── Locale code shape ────────────────────────────────────────────────────────

/**
 * ISO-639-ish locale code: 2-3 letters, optional hyphenated 2-4 letter subtag
 * (e.g. "en", "fin", "pt-br", "zh-hans"). Anchored + case-insensitive. This is
 * deliberately narrow so common prop names (label, href, title, count, …) are
 * NOT mistaken for locale codes.
 */
const LOCALE_CODE_RE = /^[a-z]{2,3}(-[a-z]{2,4})?$/i;

export function isValidLocaleCode(code: string): boolean {
  return LOCALE_CODE_RE.test(code.trim());
}

export function normalizeLocaleCode(code: string): string {
  return code.toLowerCase().trim();
}

// ── Content-locale set helpers (pure) ────────────────────────────────────────

/** The default locale used when no per-Site config is stored. */
export const FALLBACK_DEFAULT_LOCALE = "en";

export type ContentLocales = {
  /** The site default locale (always present in `locales`). */
  default: string;
  /** The full ordered set of supported content locales (includes `default`). */
  locales: string[];
};

export function defaultContentLocales(): ContentLocales {
  return { default: FALLBACK_DEFAULT_LOCALE, locales: [FALLBACK_DEFAULT_LOCALE] };
}

/**
 * Validate + normalize a raw content-locale config (e.g. parsed from settings
 * JSON). Drops invalid/duplicate codes, ensures the default is in the set and
 * leads it. Never throws — returns the safe default config on garbage input.
 */
export function normalizeContentLocales(raw: unknown): ContentLocales {
  if (raw == null || typeof raw !== "object") return defaultContentLocales();
  const obj = raw as Record<string, unknown>;

  const rawList = Array.isArray(obj.locales) ? obj.locales : [];
  const seen = new Set<string>();
  const locales: string[] = [];
  for (const item of rawList) {
    if (typeof item !== "string") continue;
    const code = normalizeLocaleCode(item);
    if (!isValidLocaleCode(code) || seen.has(code)) continue;
    seen.add(code);
    locales.push(code);
  }

  let def =
    typeof obj.default === "string" ? normalizeLocaleCode(obj.default) : "";
  if (!isValidLocaleCode(def)) def = locales[0] ?? FALLBACK_DEFAULT_LOCALE;

  if (!seen.has(def)) {
    locales.unshift(def);
  } else if (locales[0] !== def) {
    // Keep the default first.
    const idx = locales.indexOf(def);
    locales.splice(idx, 1);
    locales.unshift(def);
  }

  return { default: def, locales };
}

/**
 * Locale codes from `locales` that collide with a top-level page slug (Stage 1
 * locale-prefix routing): a page at `/fi` would be shadowed by the `/fi/...`
 * locale prefix — and adding locale "fi" would shadow an existing `/fi` page.
 * Guards BOTH write paths (page save + content-locale settings save). The
 * DEFAULT locale is deliberately included (it's unprefixed today, but flipping
 * the default later would silently shadow the page). Case-insensitive; wildcard
 * ":param" slugs never collide (the ":" prefix isn't a valid locale code).
 * Returns the conflicting codes, normalized. PURE.
 */
export function localeSlugConflicts(
  locales: string[],
  topLevelSlugs: string[],
): string[] {
  const slugs = new Set(topLevelSlugs.map((s) => s.trim().toLowerCase()));
  return locales.map(normalizeLocaleCode).filter((code) => slugs.has(code));
}

// ── Locale-object resolution (the render-time core) ──────────────────────────

/**
 * Is `value` a locale object — a non-empty plain object whose keys are ALL
 * valid locale codes? Values may be any type (string, array, nested object).
 */
export function isLocaleObject(
  value: unknown,
): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.length === 0) return false;
  return keys.every((k) => LOCALE_CODE_RE.test(k));
}

/** Build the fallback chain for a locale object: active → default → first present. */
function pickLocale(
  obj: Record<string, unknown>,
  locale: string,
  fallback: string,
): unknown {
  if (locale in obj) return obj[locale];
  if (fallback in obj) return obj[fallback];
  const values = Object.values(obj);
  return values.length > 0 ? values[0] : "";
}

/**
 * Recursively resolve every locale object within `value` to the active locale.
 *
 * - locale object → pick the active locale (fallback → default → first), then
 *   recurse into the picked value (it may itself contain nested locale objects).
 * - array → map over elements.
 * - plain object → resolve each value.
 * - primitive → unchanged.
 *
 * Never mutates the input; returns a new value.
 */
export function resolveLocalized(
  value: unknown,
  locale: string,
  fallback: string = FALLBACK_DEFAULT_LOCALE,
): unknown {
  if (value === null || typeof value !== "object") return value;

  if (isLocaleObject(value)) {
    const picked = pickLocale(value as Record<string, unknown>, locale, fallback);
    return resolveLocalized(picked, locale, fallback);
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveLocalized(item, locale, fallback));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = resolveLocalized(v, locale, fallback);
  }
  return out;
}
