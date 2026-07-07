/**
 * JSON-LD custom-component kind (seo-robots goal, tracer — render path).
 *
 * A component whose `kind` is `"jsonld"` (vs the default `"html"`) does NOT render
 * as visible HTML. Its artifact `html` column holds a JSON TEMPLATE — a schema.org
 * object with `{{prop}}` / `{{ t prop }}` slots — that the renderer interpolates
 * with the block's declared props and emits as the ESCAPED INNER text of an
 * `application/ld+json` script (funnelled onto `RenderPlan.jsonLd`, exactly like the
 * auto BreadcrumbList — RenderedPage wraps each in a <script>).
 *
 * WHY string-level slot binding (not the tree walk): JSON-LD is DATA, not markup.
 * Binding `{{prop}}` in the raw template string then `JSON.parse`-ing validates the
 * result is well-formed JSON and lets a slot fill a numeric/array value verbatim
 * (`"rating": {{rating}}`), which the HTML tree walk (which coerces everything to a
 * text node) can't express. Escaping is JSON-STRING escaping (`<`/`>`/`&` → `\uXXXX`)
 * — NOT the HTML-escape path — so no `</script>`, comment, or entity breaks out.
 *
 * PURE — no React/D1/CF imports; unit-tested with dep-free `node --test`.
 */

import { SLOT_RE, declaredProps } from "./plan-tree.ts";

/**
 * Escape a `JSON.stringify` result for safe embedding inside an inline `<script>`:
 * `<` → `<`, `>` → `>`, `&` → `&`, so no `</script>`, HTML comment,
 * or entity can break out of the script element. JSON.stringify already handles
 * quotes/backslashes/control chars. Shared by breadcrumb.ts and jsonld components —
 * ONE place per the JSON-LD escaping caveat.
 */
export function escapeJsonForScript(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/** Coerce a bound prop value to the text that replaces a slot INSIDE a JSON string
 *  literal. Strings go verbatim (their surrounding quotes live in the template);
 *  numbers/booleans stringify; objects/arrays serialize to JSON (drop the quotes in
 *  the template to splice a raw value). null/undefined → "". Mirrors plan-tree's
 *  slotString but is local so this stays a standalone pure module. */
function slotText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return "";
}

/**
 * Bind a JSON-LD template string's `{{prop}}` slots from `values`, restricted to
 * `declared` prop names (the propsSchema allowlist — an undeclared slot binds to "").
 * A string value is JSON-escaped so quotes/backslashes in user content can't break
 * the JSON when the slot sits inside a `"…"` literal. Non-string values (number,
 * boolean, object) splice their JSON form verbatim (for `"n": {{count}}` templates).
 * Returns the interpolated raw string (NOT yet parsed).
 */
export function bindJsonLdSlots(
  template: string,
  values: Record<string, unknown>,
  declared: Set<string>,
): string {
  return template.replace(SLOT_RE, (_m, name: string) => {
    if (!declared.has(name)) return "";
    const v = values[name];
    if (typeof v === "string") {
      // Drop the surrounding quotes JSON.stringify adds — the template already
      // supplies the `"…"` around a string slot; we only need the INNER escaping.
      const enc = JSON.stringify(v);
      return enc.slice(1, -1);
    }
    return slotText(v);
  });
}

/**
 * Build the escaped JSON-LD payload (the INNER text of an `application/ld+json`
 * script) for one jsonld component instance, or `null` when nothing valid can be
 * emitted:
 *  - blank template after trimming, or
 *  - the bound template doesn't `JSON.parse` (a broken template / a slot value that
 *    corrupted the JSON) — skip rather than ship malformed structured data.
 *
 * `template` is the artifact's `html` column (a JSON template with `{{prop}}` slots);
 * `props` are the block's values (already locale-resolved by the caller); `propsSchema`
 * is the component's declared-prop allowlist. Re-stringifies the parsed object (so the
 * output is canonical, whitespace-normalized JSON) then `<`/`>`/`&`-escapes it.
 */
export function buildJsonLdComponent(
  template: string,
  props: Record<string, unknown>,
  propsSchema: string | null | undefined,
): string | null {
  const raw = (template ?? "").trim();
  if (raw === "") return null;
  const bound = bindJsonLdSlots(raw, props, declaredProps(propsSchema));
  let parsed: unknown;
  try {
    parsed = JSON.parse(bound);
  } catch {
    return null; // interpolation produced invalid JSON — don't emit a broken script
  }
  if (parsed == null || typeof parsed !== "object") return null;
  return escapeJsonForScript(JSON.stringify(parsed));
}
