/**
 * Icon-set support (icon-sets epic) — PURE module.
 *
 * Sites pick a freely-licensed icon SET (Lucide, Tabler, Phosphor, …) in
 * Settings; components reference an icon by NAME with an `{{icon "name"}}` slot.
 * At render the name resolves against the site's selected set into inline SVG so
 * the glyph inherits the parent's theme-token color via `currentColor`.
 *
 * The source of truth is Iconify (https://iconify.design), which normalizes
 * 150+ sets behind one API + name schema. This module is the PURE half:
 *  - parse `{{icon "name"}}` slots out of component text,
 *  - validate set / icon names,
 *  - build the Iconify API URLs,
 *  - normalize a fetched SVG (force `currentColor`, drop fixed width/height, add
 *    `aria-hidden`) so it themes correctly and sizes from the wrapper.
 * The impure half (fetch + D1 cache) lives in `db/icon-store.ts`, and the render
 * seam (resolve-before-walk + emit an SVG element) lives in the render host.
 *
 * Kept React/D1/CF-free so it runs under dep-free `node --test` (project rule).
 */

/** Default icon set when a Site hasn't chosen one. MIT, complete, clean. */
export const DEFAULT_ICON_SET = "lucide";

/**
 * Curated, freely-licensed icon sets offered in the Settings picker (Iconify
 * prefixes). Not exhaustive — any valid Iconify prefix is accepted by the store —
 * but this is the friendly shortlist the dropdown shows, default first. Each is a
 * complete, permissively-licensed set suitable for commercial sites.
 */
export const ICON_SET_OPTIONS: { id: string; label: string; license: string }[] = [
  { id: "lucide", label: "Lucide", license: "ISC" },
  { id: "tabler", label: "Tabler", license: "MIT" },
  { id: "ph", label: "Phosphor", license: "MIT" },
  { id: "heroicons", label: "Heroicons", license: "MIT" },
  { id: "material-symbols", label: "Material Symbols", license: "Apache 2.0" },
  { id: "mdi", label: "Material Design Icons", license: "Apache 2.0" },
  { id: "carbon", label: "Carbon", license: "Apache 2.0" },
  { id: "solar", label: "Solar", license: "CC BY 4.0" },
  { id: "lucide-lab", label: "Lucide Lab", license: "ISC" },
  { id: "feather", label: "Feather", license: "MIT" },
];

/**
 * Iconify set prefix: lowercase letters, digits and hyphens (e.g. "lucide",
 * "tabler", "material-symbols", "ph"). Anchored.
 */
const ICON_SET_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Iconify icon NAME within a set: lowercase letters, digits and hyphens
 * (e.g. "calendar", "arrow-right", "user-2"). Anchored. NO set prefix here —
 * the set comes from the Site setting, not the slot.
 */
const ICON_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidIconSet(set: string): boolean {
  return ICON_SET_RE.test(set.trim());
}

export function isValidIconName(name: string): boolean {
  return ICON_NAME_RE.test(name.trim());
}

/**
 * `{{icon "name"}}` slot. The name is QUOTED (single or double) because icon
 * names carry hyphens (`arrow-right`) that the bare-identifier `{{prop}}` /
 * `{{t prop}}` slot regex (plan-tree.ts) deliberately rejects. The captured
 * group is the icon name. Global + case-insensitive on the quotes only; the
 * name itself stays lowercase (validated separately).
 */
export const ICON_SLOT_RE = /\{\{\s*icon\s+["']([a-z0-9-]+)["']\s*\}\}/g;

/** Does this text contain at least one `{{icon "…"}}` slot? */
export function hasIconSlot(text: string): boolean {
  ICON_SLOT_RE.lastIndex = 0;
  return ICON_SLOT_RE.test(text);
}

/**
 * `{{icon propName}}` (UNQUOTED identifier) — the DYNAMIC form: the icon name
 * comes from a component prop (an `icon`-typed prop set in the inspector / by the
 * AI), not a hardcoded literal. The captured group is the PROP name. Distinct
 * from `ICON_SLOT_RE` (quoted literal). Note `\s+` is required after `icon` so it
 * never collides with a prop literally containing "icon".
 */
export const ICON_DYNAMIC_SLOT_RE = /\{\{\s*icon\s+([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/**
 * Rewrite DYNAMIC `{{icon propName}}` slots into the LITERAL `{{icon "name"}}`
 * form by substituting each prop's bound value (an icon name) — only for props in
 * `declared` whose value is a valid icon name. Undeclared/empty/invalid → "" (the
 * slot is dropped). This runs during binding (where prop values are known) so the
 * downstream render walk only ever sees the literal form. PURE.
 */
export function resolveDynamicIconSlots(
  text: string,
  values: Record<string, unknown>,
  declared: Set<string>,
): string {
  if (typeof text !== "string" || text.indexOf("{{") === -1) return text;
  ICON_DYNAMIC_SLOT_RE.lastIndex = 0;
  return text.replace(ICON_DYNAMIC_SLOT_RE, (_m, prop: string) => {
    if (!declared.has(prop)) return "";
    const v = values[prop];
    return typeof v === "string" && isValidIconName(v) ? `{{icon "${v}"}}` : "";
  });
}

/**
 * Collect the distinct, VALID icon names referenced by `{{icon "…"}}` slots in a
 * text string. Invalid names are skipped (they render as nothing downstream).
 */
export function collectIconNames(text: string, into: Set<string>): void {
  if (typeof text !== "string" || text.indexOf("{{") === -1) return;
  ICON_SLOT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ICON_SLOT_RE.exec(text)) !== null) {
    const name = m[1];
    if (isValidIconName(name)) into.add(name);
  }
}

/**
 * Split a text string into ordered segments at `{{icon "…"}}` boundaries, so the
 * render walk can replace each icon slot with an SVG element while keeping the
 * surrounding text as plain text nodes. Returns `[{text}|{icon}]` parts. A
 * string with no icon slots returns a single text part (cheap fast-path).
 */
export type IconTextPart =
  | { kind: "text"; text: string }
  | { kind: "icon"; name: string };

export function splitIconText(text: string): IconTextPart[] {
  if (typeof text !== "string" || text.indexOf("{{") === -1) {
    return [{ kind: "text", text: typeof text === "string" ? text : "" }];
  }
  const parts: IconTextPart[] = [];
  let last = 0;
  ICON_SLOT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ICON_SLOT_RE.exec(text)) !== null) {
    if (m.index > last) parts.push({ kind: "text", text: text.slice(last, m.index) });
    const name = m[1];
    // Keep only valid names as icons; an invalid name collapses to "" (dropped).
    if (isValidIconName(name)) parts.push({ kind: "icon", name });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  if (parts.length === 0) return [{ kind: "text", text: "" }];
  return parts;
}

/**
 * Collect, from a single text string, both the LITERAL icon names (`{{icon "x"}}`)
 * into `names` AND the DYNAMIC prop names (`{{icon prop}}`) into `dynamicProps`.
 * Used to scan a component's tree text once. PURE.
 */
export function scanIconSlots(
  text: string,
  names: Set<string>,
  dynamicProps: Set<string>,
): void {
  if (typeof text !== "string" || text.indexOf("{{") === -1) return;
  collectIconNames(text, names);
  ICON_DYNAMIC_SLOT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ICON_DYNAMIC_SLOT_RE.exec(text)) !== null) dynamicProps.add(m[1]);
}

// ── Iconify API URLs ─────────────────────────────────────────────────────────

const ICONIFY_BASE = "https://api.iconify.design";

/** SVG endpoint for one icon: `{base}/{set}/{name}.svg`. */
export function iconifySvgUrl(set: string, name: string): string {
  return `${ICONIFY_BASE}/${encodeURIComponent(set)}/${encodeURIComponent(name)}.svg`;
}

/**
 * Search endpoint, scoped to one set: returns icon names matching `query`.
 * `limit` is clamped to Iconify's accepted range (1–999).
 */
export function iconifySearchUrl(set: string, query: string, limit = 48): string {
  const lim = Math.max(1, Math.min(999, Math.floor(limit) || 48));
  const q = encodeURIComponent(query.trim());
  return `${ICONIFY_BASE}/search?query=${q}&prefix=${encodeURIComponent(set)}&limit=${lim}`;
}

// ── SVG normalization ────────────────────────────────────────────────────────

/**
 * Normalize a raw Iconify SVG string so it (1) inherits the parent's theme color
 * via `currentColor`, (2) has no baked-in pixel size (the wrapper sizes it via
 * `width/height="1em"` + Tailwind text-size), and (3) is `aria-hidden` (icons are
 * decorative; authors add a text label). Returns the cleaned SVG, or null if the
 * input isn't a usable `<svg>…</svg>`.
 *
 * Crucially it PRESERVES the root's own fill/stroke strategy: stroke-based sets
 * (Lucide, Tabler, Feather) ship `fill="none" stroke="currentColor"`, while
 * fill-based sets (Material, Phosphor-fill) ship `fill="currentColor"`. We must
 * not force one onto the other — forcing `fill` onto a stroke icon blacks it out.
 * Iconify already emits `currentColor` on the root, so we keep the root tag's
 * paint attrs verbatim and only (a) replace any explicit hex/named colors in the
 * BODY with currentColor, (b) drop fixed width/height, (c) add a11y/size attrs.
 *
 * Deliberately string-surgery, not a DOM parse: it runs on the Worker (no DOM)
 * and the input is Iconify's own well-formed output, not arbitrary user HTML.
 * ponytail: regex on trusted Iconify output; swap to a real SVG parser only if
 * we ever ingest untrusted SVG.
 */
export function normalizeIconSvg(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  // Must be a lone <svg> root (Iconify returns exactly this). Reject anything
  // that smells like script/foreignObject — Iconify never emits them.
  if (!/^<svg[\s>]/i.test(trimmed) || !/<\/svg>\s*$/i.test(trimmed)) return null;
  if (/<\s*(script|foreignObject)\b/i.test(trimmed)) return null;

  const openMatch = trimmed.match(/^<svg\b([^>]*)>/i);
  if (!openMatch) return null;
  const openAttrs = openMatch[1];
  const body = trimmed.slice(openMatch[0].length).replace(/<\/svg>\s*$/i, "");

  const viewBox = openAttrs.match(/\bviewBox\s*=\s*["']([^"']*)["']/i)?.[1] ?? "0 0 24 24";

  // Preserve the root's paint strategy (the bit that distinguishes stroke vs fill
  // sets): carry over fill, stroke, stroke-width, stroke-linecap/linejoin verbatim
  // — but NOT width/height (we set our own scalable 1em).
  const carried: string[] = [];
  for (const attr of ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"]) {
    const v = openAttrs.match(new RegExp(`\\b${attr}\\s*=\\s*["']([^"']*)["']`, "i"))?.[1];
    if (v != null) carried.push(`${attr}="${v}"`);
  }
  // Default to a filled glyph only when the root declared NEITHER fill nor stroke
  // (rare; some single-path icons rely on the SVG default fill:black → currentColor).
  if (!carried.some((a) => a.startsWith("fill=")) && !carried.some((a) => a.startsWith("stroke="))) {
    carried.push(`fill="currentColor"`);
  }

  // In the BODY, swap any explicit color literal (hex, rgb, or a named color) on a
  // fill/stroke attr to currentColor — but never touch `none` (it disables paint).
  const recolored = body.replace(
    /(\b(?:fill|stroke)\s*=\s*)["'](?!none\b|currentColor\b|url\()[^"']*["']/gi,
    '$1"currentColor"',
  );

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" ` +
    `width="1em" height="1em" aria-hidden="true" focusable="false" ` +
    `${carried.join(" ")}>${recolored}</svg>`
  );
}
