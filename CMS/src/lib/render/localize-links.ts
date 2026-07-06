/**
 * Locale-prefix internal links at plan time (path-locales-edge-cache Stage 1).
 *
 * When a page renders under a NON-default content locale (`/fi/about`), every
 * internal `href` in the final ElementPlan (operator link props bound into
 * `<a href>`, AND static hrefs authored inside component trees) must point at
 * the SAME locale's URL — `/pricing` becomes `/fi/pricing` — or one click drops
 * the visitor back to the default locale. Done as a pure post-pass over the
 * finished plan so it covers every href regardless of how it got there
 * (block prop, schema default, binding hydration, List row stamp).
 *
 * PURE — no React/D1/CF imports; unit-tested with dep-free `node --test`.
 */

import type { ElementPlan, LocaleContext } from "./plan-types.ts";

/**
 * First path segments that are NOT locale-routable pages — Worker/system routes
 * a locale prefix would break. `/media/…` is the R2 asset route (task spec);
 * the rest are the admin/app surfaces the edge-cache wrapper also excludes.
 */
const SKIP_SEGMENTS = new Set(["media", "api", "admin", "preview", "_next"]);

/** The first path segment of an absolute path, decoded + lowercased ("" for "/"). */
function firstSegment(path: string): string {
  const rest = path.slice(1);
  let end = rest.length;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (ch === "/" || ch === "?" || ch === "#") {
      end = i;
      break;
    }
  }
  const seg = rest.slice(0, end);
  try {
    return decodeURIComponent(seg).trim().toLowerCase();
  } catch {
    return seg.trim().toLowerCase();
  }
}

/**
 * Rewrite one href for the active locale. Returns the input unchanged for:
 * - non-internal values: external URLs, `mailto:`, `#` anchors, relative paths,
 *   protocol-relative `//host`, empty strings;
 * - system paths (`/media/…`, `/api/…`, `/admin…`, `/preview…`, `/_next…`);
 * - paths already carrying ANY configured locale code as their first segment
 *   (never double-prefix; a first segment equal to the default code is already
 *   unreachable as a page slug — the localeSlugConflicts guard);
 * - when the active locale IS the default (default stays unprefixed).
 */
export function localizeHref(
  href: string,
  activeLocale: string,
  defaultLocale: string,
  localeCodes: string[],
): string {
  if (activeLocale.toLowerCase() === defaultLocale.toLowerCase()) return href;
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const first = firstSegment(href);
  if (SKIP_SEGMENTS.has(first)) return href;
  if (localeCodes.some((code) => code.toLowerCase() === first)) return href;
  // Locale codes are URL-safe by shape (letters + hyphen) — no encoding needed.
  // Root links drop the trailing slash ("/" → "/fi", "/?x=1" → "/fi?x=1") so the
  // browser isn't bounced through Next's 308 trailing-slash redirect.
  const prefix = `/${activeLocale}`;
  if (href === "/") return prefix;
  if (href.startsWith("/?") || href.startsWith("/#")) return prefix + href.slice(1);
  return prefix + href;
}

/**
 * Walk finished element plans, rewriting every element's string `href` prop via
 * `localizeHref`. Returns the SAME array/nodes when nothing changes (cheap
 * no-op on default-locale renders). Locale codes come from `locale.available`
 * (the Site's full set); absent → just active+fallback.
 */
export function localizePlanLinks(
  plans: ElementPlan[],
  locale: LocaleContext,
): ElementPlan[] {
  if (locale.locale.toLowerCase() === locale.fallback.toLowerCase()) return plans;
  const codes = locale.available?.map((l) => l.code) ?? [locale.locale, locale.fallback];

  function walk(plan: ElementPlan): ElementPlan {
    if (plan.kind !== "element") return plan;
    let props = plan.props;
    const href = props.href;
    if (typeof href === "string") {
      const next = localizeHref(href, locale.locale, locale.fallback, codes);
      if (next !== href) props = { ...props, href: next };
    }
    let children = plan.children;
    let changed = false;
    const walked = children.map((c) => {
      const w = walk(c);
      if (w !== c) changed = true;
      return w;
    });
    if (changed) children = walked;
    if (props === plan.props && children === plan.children) return plan;
    return { ...plan, props, children };
  }

  let changed = false;
  const out = plans.map((p) => {
    const w = walk(p);
    if (w !== p) changed = true;
    return w;
  });
  return changed ? out : plans;
}
