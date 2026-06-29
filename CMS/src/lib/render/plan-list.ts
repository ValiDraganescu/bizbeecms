/**
 * Built-in `List` block → per-row stamp + the "combobox" presentation shell.
 *
 * A List has a per-row TEMPLATE (its children that are NOT the empty-state slot)
 * and an optional empty-state slot (a child with `listRole === "empty"`). The
 * rows are in `block.listRows` (hydrated by buildPlanFromPage). For each row we
 * CLONE the template blocks and inject the mapped fields (`listMap`) into each
 * stamped block's `props` — `planBlock` then binds those into the template
 * component's `{{slots}}`, GATED by the component's own declared props (the same
 * allowlist the static path uses), so an unmapped/unknown prop can't leak in.
 *
 * GRACEFUL: no rows → the empty-state slot if present, else nothing. The List
 * itself renders as a plain container `<div data-list>` wrapping the stamped rows
 * (mirrors Section's `data-section` wrapper — a stable, style-free hook).
 *
 * Split out of `tree.ts` (which re-exports `normalizeLabelExpr`). PURE — no I/O.
 */

import { type Block, type ElementPlan, type ListSource } from "./plan-types.ts";

/**
 * Canonicalize a combobox `labelExpr` to a bare TEMPLATE-LITERAL BODY: trimmed,
 * with a single pair of surrounding backticks stripped if present. The field IS a
 * template body (e.g. `${name} ★ ${rating}`) — the renderer wraps it back in
 * backticks to evaluate. Accepting backticks here means neither the operator nor
 * the AI has to know whether to add them; we store the clean form either way.
 * Idempotent. "" / undefined → "".
 */
export function normalizeLabelExpr(expr: string | null | undefined): string {
  const s = (expr ?? "").trim();
  if (s.length >= 2 && s.startsWith("`") && s.endsWith("`")) {
    return s.slice(1, -1).trim();
  }
  return s;
}

/**
 * Inject a row's mapped fields into a template block's props (recursively into
 * its children, so a nested template still receives the row's values). For each
 * `templatePropName → fieldName` in `map`, set `props[templatePropName] =
 * row[fieldName]` when the row actually HAS that field (graceful: a missing field
 * leaves the prop untouched, so an author's static default survives). PURE — a
 * NEW block tree; the originals are untouched. A bound row value OVERWRITES a
 * static prop (the row is the live source of truth, mirroring Slice A).
 */
function stampRow(
  block: Block,
  row: Record<string, unknown>,
  map: Record<string, string>,
): Block {
  const props: Record<string, unknown> = { ...(block.props ?? {}) };
  for (const [propName, fieldName] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(row, fieldName)) {
      props[propName] = row[fieldName];
    }
  }
  return {
    ...block,
    props,
    ...(block.children
      ? { children: block.children.map((c) => stampRow(c, row, map)) }
      : {}),
  };
}

export function planList(
  block: Block,
  planBlock: (b: Block) => ElementPlan,
  useComboboxAssets?: () => void,
): ElementPlan {
  const children = block.children ?? [];
  const template = children.filter((c) => c.listRole !== "empty");
  const emptySlot = children.filter((c) => c.listRole === "empty");
  const rows = Array.isArray(block.listRows) ? block.listRows : [];
  const map = block.listMap ?? {};

  // Empty / dead / un-hydrated result → the empty-state slot if authored, else
  // nothing (an empty container). NEVER a throw — mirrors Section's graceful path.
  if (rows.length === 0) {
    return listWrapper(block, emptySlot.map(planBlock));
  }

  // Stamp the item component once PER ROW (the row's mapped fields bind into the
  // stamped component's declared props). This is shared by both presentations.
  const stampPlan = (row: Record<string, unknown>): ElementPlan[] =>
    template.map((t) => planBlock(stampRow(t, row, map)));

  // "combobox" presentation: wrap each stamped row in a selectable option element
  // carrying a STABLE value, and nest the lot in the combobox shell. The combobox
  // CLIENT script enhances these pre-stamped options (select/search/check/limits)
  // — it does NOT build the rows; the rows are real server-stamped CMS components.
  if (block.listSource?.presentation === "combobox") {
    useComboboxAssets?.();
    return planComboboxList(block, rows, stampPlan);
  }

  // Default: a flat list of stamped rows.
  return listWrapper(block, rows.flatMap(stampPlan));
}

/** The plain List wrapper — a stable, style-free hook (mirrors Section). */
function listWrapper(block: Block, children: ElementPlan[]): ElementPlan {
  return {
    kind: "element",
    tag: "div",
    props: { "data-list": block.id },
    children,
  };
}

/**
 * Resolve the per-row VALUE used as an option's stable identity. Authoring picks
 * the collection field via `listSource.valueField`; falls back to the row's `id`
 * (every content row has one), then to the row index handled by the caller.
 */
function rowValue(
  block: Block,
  row: Record<string, unknown>,
  index: number,
): string {
  const field = block.listSource?.valueField;
  const raw = field ? row[field] : row.id;
  return raw == null ? String(index) : String(raw);
}

/**
 * "combobox" List presentation — the List acts as a Combobox CONTAINER:
 *  - emits the combobox shell (trigger + summary + caret, and a panel with an
 *    optional search box + an options list + empty/hint slots),
 *  - stamps the chosen ITEM COMPONENT once per row as each option's BODY,
 *  - wraps each option in `<li data-cb-option data-cb-value="…">` carrying a
 *    combobox-owned check; the client `combobox-list` script (shipped as a normal
 *    component script via the registry) wires selection/search/min/max/single-
 *    multi over these PRE-STAMPED options. The author's item component is purely
 *    visual — it never knows about selection.
 *
 * Config rides on `listSource` (mode/min/max/search/sort already authored on the
 * List) so there is ONE authoring panel. Pure — no I/O.
 */
function planComboboxList(
  block: Block,
  rows: Array<Record<string, unknown>>,
  stampPlan: (row: Record<string, unknown>) => ElementPlan[],
): ElementPlan {
  const src = block.listSource ?? ({} as ListSource);
  const cfg = {
    multiple: src.select !== "single",
    min: src.min ?? 0,
    max: src.max ?? 0,
    searchable: src.searchable !== false,
    name: src.name ?? "selection",
    placeholder: src.placeholder ?? "Select…",
    searchPlaceholder: src.searchPlaceholder ?? "Search…",
  };

  const labelField = src.labelField;
  const options: ElementPlan[] = rows.map((row, i) => {
    const liProps: Record<string, unknown> = {
      "data-cb-option": "",
      "data-cb-value": rowValue(block, row, i),
      role: "option",
      "aria-selected": "false",
      className: "cb-opt",
    };
    // Chip label source, in precedence order the client applies: a resolved field
    // value (data-cb-label), and the whole row JSON for the optional client-side
    // label expression (data-cb-row). Absent both → the client falls back to the
    // option's flattened text content.
    if (labelField && row[labelField] != null) liProps["data-cb-label"] = String(row[labelField]);
    if (src.labelExpr) liProps["data-cb-row"] = JSON.stringify(row);
    return {
      kind: "element" as const,
      tag: "li",
      props: liProps,
      children: [
        { kind: "element" as const, tag: "div", props: { className: "cb-opt-body" }, children: stampPlan(row) },
        checkmarkPlan(),
      ],
    };
  });

  const panelChildren: ElementPlan[] = [];
  if (cfg.searchable) {
    panelChildren.push({
      kind: "element",
      tag: "div",
      props: { className: "cb-search-wrap", "data-cb-search-wrap": "" },
      children: [
        {
          kind: "element",
          tag: "input",
          props: { type: "text", "data-cb-search": "", className: "cb-search", placeholder: cfg.searchPlaceholder },
          children: [],
        },
      ],
    });
  }
  panelChildren.push({
    kind: "element",
    tag: "ul",
    props: { "data-cb-list": "", role: "listbox", className: "cb-list" },
    children: options,
  });
  panelChildren.push({
    kind: "element",
    tag: "div",
    props: { "data-cb-empty": "", className: "cb-empty cb-hidden" },
    children: [{ kind: "text", text: "No matches" }],
  });
  panelChildren.push({
    kind: "element",
    tag: "div",
    props: { "data-cb-hint": "", className: "cb-hint cb-hidden" },
    children: [],
  });

  const rootProps: Record<string, unknown> = {
    "data-list": block.id,
    "data-combobox-list": "",
    "data-cb-multiple": cfg.multiple ? "true" : "false",
    "data-cb-min": String(cfg.min),
    "data-cb-max": String(cfg.max),
    "data-cb-name": cfg.name,
    "data-cb-placeholder": cfg.placeholder,
    className: "cb-root",
  };
  // The optional client-side label expression (admin-authored, evaluated against
  // each option's row in the browser). Stamped as data only — never run here.
  // Normalize to a bare template-literal BODY (strip any stored backticks); the
  // client wraps it back in backticks before eval. Handles both new clean values
  // and legacy backtick-wrapped ones identically.
  const labelExpr = normalizeLabelExpr(src.labelExpr);
  if (labelExpr) rootProps["data-cb-label-expr"] = labelExpr;

  return {
    kind: "element",
    tag: "div",
    props: rootProps,
    children: [
      { kind: "element", tag: "input", props: { type: "hidden", "data-cb-value-input": "", name: cfg.name }, children: [] },
      {
        kind: "element",
        tag: "button",
        props: { type: "button", "data-cb-trigger": "", className: "cb-trigger" },
        children: [
          { kind: "element", tag: "span", props: { "data-cb-summary": "", className: "cb-summary" }, children: [{ kind: "text", text: cfg.placeholder }] },
          caretPlan(),
        ],
      },
      { kind: "element", tag: "div", props: { "data-cb-panel": "", className: "cb-panel cb-hidden" }, children: panelChildren },
    ],
  };
}

/** A combobox-owned selection checkmark (hidden until the option is selected). */
function checkmarkPlan(): ElementPlan {
  return {
    kind: "element",
    tag: "svg",
    props: { className: "cb-check", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" },
    children: [
      { kind: "element", tag: "path", props: { "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-width": "2", d: "M5 13l4 4L19 7" }, children: [] },
    ],
  };
}

/** The trigger's caret chevron. */
function caretPlan(): ElementPlan {
  return {
    kind: "element",
    tag: "svg",
    props: { "data-cb-caret": "", className: "cb-caret", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" },
    children: [
      { kind: "element", tag: "path", props: { "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-width": "2", d: "M19 9l-7 7-7-7" }, children: [] },
    ],
  };
}
