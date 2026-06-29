/**
 * Normalize a render-plan element's props (authored as plain HTML/SVG attributes)
 * into the names React's `createElement` expects — so a component the AI emits in
 * ordinary HTML casing renders without React DOM warnings, and our own built-in
 * plans (combobox SVGs) stay clean too. PURE + dependency-free so `react.tsx` can
 * apply it at the createElement boundary and `node --test` can pin the mapping.
 *
 * What it fixes (the warnings seen in the wild):
 *  - SVG/HTML hyphenated presentation attrs → camelCase
 *    (stroke-linecap → strokeLinecap, stroke-width, fill-rule, clip-path, …).
 *  - `class`/`for` → `className`/`htmlFor` (parse-html already does this, but a
 *    built-in plan or a stray attr might not — idempotent here).
 *  - Inline event handlers (`onclick`, `onsubmit`, …) are STRING values from JSON,
 *    never functions; React can't use them and warns. We DROP them — interactivity
 *    comes from the component's client `script`, not inline handlers.
 *  - Static-form value attrs that React treats as "controlled": `selected` on an
 *    <option>, `checked` on an input, and `value` on a form control become their
 *    uncontrolled `default*` form (defaultSelected/defaultChecked/defaultValue) so
 *    SSR shows the authored state without a controlled-without-onChange warning.
 *
 * `data-*` and `aria-*` are left verbatim (React passes those through as-is).
 * Already-camelCased keys (strokeWidth, className) pass through unchanged.
 */

/** Hyphenated attribute name → React camelCase. Not data-/aria- (those stay). */
function hyphenToCamel(name: string): string {
  return name.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
}

/** Inline DOM event-handler attr (onclick, onSubmit, onmouseover, …)? */
function isEventHandlerAttr(name: string): boolean {
  return /^on[a-z]/i.test(name);
}

/**
 * Map one HTML/SVG attribute name to its React prop name. `class`/`for` → React
 * names; hyphenated SVG/HTML attrs → camelCase; everything else (incl. data-/
 * aria-/already-camel) unchanged.
 */
function attrToReactName(name: string): string {
  if (name === "class") return "className";
  if (name === "for") return "htmlFor";
  // data-* / aria-* are valid React props verbatim — never camelCase them.
  if (name.startsWith("data-") || name.startsWith("aria-")) return name;
  if (name.includes("-")) return hyphenToCamel(name);
  return name;
}

/**
 * The tag this element renders as — needed because `value`/`checked`/`selected`
 * only need the uncontrolled treatment on form elements.
 */
export function htmlPropsToReact(
  tag: string,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const isFormControl = tag === "input" || tag === "select" || tag === "textarea";
  for (const [rawKey, value] of Object.entries(props)) {
    // Drop inline event handlers — string values React can't bind (the component's
    // client script owns behavior). Keeps the SSR plan free of onClick/onSubmit warns.
    if (isEventHandlerAttr(rawKey)) continue;

    const key = attrToReactName(rawKey);

    // Uncontrolled static form state → React's default* props (no onChange needed).
    if (key === "selected" && tag === "option") {
      out.defaultSelected = value;
      continue;
    }
    if (key === "checked" && tag === "input") {
      out.defaultChecked = value;
      continue;
    }
    if (key === "value" && isFormControl) {
      out.defaultValue = value;
      continue;
    }
    out[key] = value;
  }
  return out;
}
