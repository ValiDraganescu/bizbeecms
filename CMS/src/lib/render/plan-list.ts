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

/** Stable asset key + client script for the optional seamless auto-scroll. */
export const LIST_AUTOSCROLL_ASSET_KEY = "__builtin_list_autoscroll__";

// px/sec for each speed tier — the client advances scroll by (px/sec × dt).
const AUTOSCROLL_PXPS: Record<string, number> = { slow: 20, normal: 45, fast: 90 };

/**
 * Seamless auto-scroll for `[data-list-autoscroll]` containers. The renderer
 * DUPLICATES the row content (a second `[data-list-track]` clone marked
 * aria-hidden), so scrolling past the first copy's end lands on the identical
 * start of the second — reset to 0 there for an unbroken loop. Pauses on hover.
 * rAF-driven; respects prefers-reduced-motion (no motion → static scroll box).
 */
export const LIST_AUTOSCROLL_SCRIPT = `
(function () {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var speeds = ${JSON.stringify(AUTOSCROLL_PXPS)};
  document.querySelectorAll('[data-list-autoscroll]').forEach(function (el) {
    if (el.__bbScroll) return;
    el.__bbScroll = true;
    var horizontal = el.getAttribute('data-list-dir') === 'horizontal';
    var pps = speeds[el.getAttribute('data-list-speed')] || speeds.normal;
    var paused = false;
    el.addEventListener('mouseenter', function () { paused = true; });
    el.addEventListener('mouseleave', function () { paused = false; });
    var last = null;
    function step(now) {
      if (last == null) last = now;
      var dt = (now - last) / 1000; last = now;
      if (!paused) {
        // Half the scrollable span is one full copy of the content (we cloned it).
        var half = (horizontal ? el.scrollWidth : el.scrollHeight) / 2;
        var pos = (horizontal ? el.scrollLeft : el.scrollTop) + pps * dt;
        if (half > 0 && pos >= half) pos -= half;
        if (horizontal) el.scrollLeft = pos; else el.scrollTop = pos;
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
})();
`.trim();

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
  useAutoscrollAssets?: () => void,
): ElementPlan {
  const children = block.children ?? [];
  const template = children.filter((c) => c.listRole !== "empty");
  const emptySlot = children.filter((c) => c.listRole === "empty");
  const rows = Array.isArray(block.listRows) ? block.listRows : [];
  const map = block.listMap ?? {};

  // Empty / dead / un-hydrated result → the empty-state slot if authored, else
  // nothing (an empty container). NEVER a throw — mirrors Section's graceful path.
  if (rows.length === 0) {
    return listWrapper(block, emptySlot.map(planBlock), useAutoscrollAssets);
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
  return listWrapper(block, rows.flatMap(stampPlan), useAutoscrollAssets);
}

/**
 * The plain List wrapper — applies the optional direction / max-size scroll box
 * and seamless auto-scroll (`listSource` layout fields). Defaults to a bare
 * `<div data-list>` (byte-identical to before) when no layout is configured.
 */
function listWrapper(
  block: Block,
  children: ElementPlan[],
  useAutoscrollAssets?: () => void,
): ElementPlan {
  const src = block.listSource ?? ({} as ListSource);
  const horizontal = src.direction === "horizontal";
  const grid = src.direction === "grid";
  const style: Record<string, string | number> = {};
  // Only shape the box when the operator asked for a non-default layout, a size
  // cap, or auto-scroll — otherwise stay a plain, unstyled container.
  const shaped =
    horizontal || grid || src.maxSize != null || src.autoscroll === true || src.gap != null;
  if (shaped) Object.assign(style, layoutStyle(src));

  const maxSizeUnit = src.maxSizeUnit ?? "px";
  if (horizontal) {
    // Horizontal scrolls on X (the row can exceed its container width); maxSize
    // caps the visible width.
    style.overflowX = "auto";
    if (src.maxSize != null) style.maxWidth = `${src.maxSize}${maxSizeUnit}`;
  } else if (src.maxSize != null) {
    // Vertical / grid: maxSize caps height; content past it scrolls on Y.
    style.maxHeight = `${src.maxSize}${maxSizeUnit}`;
    style.overflowY = "auto";
  }

  // A responsive grid (tablet/mobile column overrides) needs the global @media
  // rules keyed off this class; harmless when no overrides are set.
  const gridClass = grid ? LIST_GRID_CLASS : undefined;

  const props: Record<string, unknown> = { "data-list": block.id };
  if (shaped) props.style = style;

  // Auto-scroll: duplicate the content into a second aria-hidden track so the
  // loop is seamless (see LIST_AUTOSCROLL_SCRIPT), and hand the client the axis
  // + speed. Each track mirrors the container's own layout (row / column / grid),
  // so the grid class + variables ride on the TRACK (the element that is display:grid).
  if (src.autoscroll === true && children.length > 0) {
    useAutoscrollAssets?.();
    props["data-list-autoscroll"] = "";
    props["data-list-dir"] = horizontal ? "horizontal" : "vertical";
    props["data-list-speed"] = src.autoscrollSpeed ?? "normal";
    const track = (hidden: boolean): ElementPlan => ({
      kind: "element",
      tag: "div",
      props: {
        "data-list-track": "",
        ...(gridClass ? { className: gridClass } : {}),
        ...(hidden ? { "aria-hidden": "true" } : {}),
        style: { ...layoutStyle(src), flexShrink: 0 },
      },
      children,
    });
    return { kind: "element", tag: "div", props, children: [track(false), track(true)] };
  }

  if (gridClass) props.className = gridClass;
  return { kind: "element", tag: "div", props, children };
}

/** Class marking a responsive grid List so the global @media rules apply. */
export const LIST_GRID_CLASS = "pb-list-grid";

/**
 * The display/flow style for a list layout mode (shared by box + auto-scroll
 * track). Grid emits per-breakpoint column counts as CSS variables
 * (`--pb-cols`/`--pb-cols-tablet`/`--pb-cols-mobile`); the global rules in
 * `listGridCss()` read them at each breakpoint (inline styles can't do @media).
 */
function layoutStyle(src: ListSource): Record<string, string | number> {
  const gap: Record<string, string> =
    src.gap != null ? { gap: `${Math.max(0, src.gap)}${src.gapUnit ?? "px"}` } : {};
  if (src.direction === "grid") {
    const clamp = (n: number | undefined, fallback: number) =>
      Math.max(1, Math.floor(n ?? fallback));
    const cols = clamp(src.columns, 2);
    const style: Record<string, string | number> = {
      display: "grid",
      // Only the column-count VARIABLES are inline; `grid-template-columns` itself
      // lives in `.pb-list-grid` (listGridCss) so the @media rules can override it.
      // (An inline grid-template-columns would beat any stylesheet rule, media or
      // not — that's why the responsive breakpoints must NOT set it here.)
      "--pb-cols": cols,
      ...gap,
    };
    if (src.columnsTablet != null) style["--pb-cols-tablet"] = clamp(src.columnsTablet, cols);
    if (src.columnsMobile != null) style["--pb-cols-mobile"] = clamp(src.columnsMobile, cols);
    return style;
  }
  const horizontal = src.direction === "horizontal";
  return {
    display: "flex",
    flexDirection: horizontal ? "row" : "column",
    ...(horizontal ? { flexWrap: "nowrap" } : {}),
    ...gap,
  };
}

/**
 * Global (non-Tailwind) CSS for responsive grid Lists: at tablet/mobile widths,
 * a `.pb-list-grid` re-reads `--pb-cols-tablet`/`--pb-cols-mobile` (each falling
 * back to `--pb-cols`) for its column count. Appended once per page that has a
 * grid List. Breakpoints match the page-builder viewport toggle + viewportHideCss.
 */
export function listGridCss(): string {
  return [
    // Base (desktop): read --pb-cols. Kept in a rule (NOT inline) so the media
    // rules below can override it — inline grid-template-columns beats @media.
    `.${LIST_GRID_CLASS}{grid-template-columns:repeat(var(--pb-cols,2),minmax(0,1fr))}`,
    `@media (max-width:767px){.${LIST_GRID_CLASS}{grid-template-columns:repeat(var(--pb-cols-mobile,var(--pb-cols,2)),minmax(0,1fr))}}`,
    `@media (min-width:768px) and (max-width:1023px){.${LIST_GRID_CLASS}{grid-template-columns:repeat(var(--pb-cols-tablet,var(--pb-cols,2)),minmax(0,1fr))}}`,
  ].join("\n");
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
