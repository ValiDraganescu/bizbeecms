/**
 * Section → Columns layout planning (the aicms Section→Columns model, ported to
 * plain ElementPlan) + the per-block width wrapper.
 *
 * Split out of `tree.ts` (which re-exports the public bits). PURE — node-testable,
 * no React. The grid math mirrors aicms `BlockRenderer.tsx` SectionRenderer.
 */

import {
  type Block,
  type ElementPlan,
  SECTION_ROW_COMPONENT,
  SECTION_COLUMN_COMPONENT,
  num,
  str,
} from "./plan-types.ts";

// A Section's props (all optional, defaults in parens): columns(1),
// columnBehavior("equal"|"collapse"), verticalAlign(top|center|bottom),
// horizontalAlign(left|center|right), paddingTop/Right/Bottom/Left(0) with
// matching *Unit props (rem default — the operator picks rem/px per value),
// gap(16, px), maxWidth("1280px"|"full"), backgroundColor("transparent").

const ALIGN_ITEMS: Record<string, string> = {
  top: "flex-start",
  center: "center",
  bottom: "flex-end",
};
const JUSTIFY: Record<string, string> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

/**
 * Per-column MIN width below which `equal`-behavior columns auto-stack (wrap one
 * below the other) instead of crushing/overflowing on a narrow viewport. The
 * renderer emits INLINE styles which cannot hold `@media`, so responsiveness is
 * achieved with `repeat(auto-fit, minmax(min(100%, MIN), 1fr))`: each track is at
 * least MIN wide (but never wider than 100% on a phone), and `auto-fit` drops the
 * row to fewer columns — ultimately one — when MIN no longer fits. ~16rem (256px)
 * stacks 2-up around tablet and 1-up on phones. (Could later be a Section prop.)
 */
export const MIN_COLUMN_WIDTH = "16rem";

/**
 * A padding value + unit (rem default). When `unit` is given (Section uses a SINGLE
 * shared `paddingUnit` for all four sides), it governs every side; otherwise each
 * side reads its own `padding<Side>Unit` (the per-column padding panel still does).
 */
function pad(
  p: Record<string, unknown>,
  side: "Top" | "Right" | "Bottom" | "Left",
  unit?: string,
): string {
  return `${num(p[`padding${side}`], 0)}${unit ?? str(p[`padding${side}Unit`], "rem")}`;
}
/** A margin value + its per-side unit (rem default). 0 → "0" (no unit churn). */
function mgn(p: Record<string, unknown>, side: "Top" | "Right" | "Bottom" | "Left"): string {
  return `${num(p[`margin${side}`], 0)}${str(p[`margin${side}Unit`], "rem")}`;
}

/**
 * Per-column cell style (epic: Column settings panel). A column carries its OWN
 * optional props that override the Section defaults for THIS column only:
 *   - verticalAlign(top|center|bottom) / horizontalAlign(left|center|right) —
 *     override the Section's column alignment; absent → inherit `sectionAlignItems`
 *     / `sectionJustify` passed by planSection.
 *   - padding{Top,Right,Bottom,Left} + per-side *Unit (rem default).
 *   - margin{Top,Right,Bottom,Left} + per-side *Unit (rem default).
 *   - gap (px) between the column's stacked components (the column is a flex
 *     column, so `gap` spaces its children vertically).
 *   - backgroundColor (theme token `var(--color-*)`; default transparent so dark
 *     mode works — resolved inline at render, like the Section background).
 * Absent props fall back to render defaults (no padding/margin/gap, transparent).
 * PURE — node-testable, no React.
 */
export function columnStyle(
  props: Record<string, unknown> | undefined,
  sectionAlignItems: string,
  sectionJustify: string,
): Record<string, string | number> {
  const p = props ?? {};
  const alignItems = p.verticalAlign != null ? (ALIGN_ITEMS[str(p.verticalAlign, "top")] ?? sectionAlignItems) : sectionAlignItems;
  const justifyContent = p.horizontalAlign != null ? (JUSTIFY[str(p.horizontalAlign, "left")] ?? sectionJustify) : sectionJustify;
  return {
    minWidth: 0,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems,
    justifyContent,
    gap: `${num(p.gap, 0)}px`,
    paddingTop: pad(p, "Top"),
    paddingRight: pad(p, "Right"),
    paddingBottom: pad(p, "Bottom"),
    paddingLeft: pad(p, "Left"),
    marginTop: mgn(p, "Top"),
    marginRight: mgn(p, "Right"),
    marginBottom: mgn(p, "Bottom"),
    marginLeft: mgn(p, "Left"),
    backgroundColor: str(p.backgroundColor, "transparent"),
  };
}

/**
 * The `grid-template-columns` value for one ROW's columns. `collapse` shrinks
 * empty columns to 0fr (fixed N tracks, no wrap); `equal` is responsive
 * (auto-fit ≥MIN-wide tracks capped at 100% so a narrow viewport stacks columns).
 * A 1-column row keeps a single full-width track either way. PURE.
 */
export function rowGridCols(cols: Block[], columns: number, columnBehavior: string): string {
  if (columnBehavior === "collapse") {
    return (
      cols.map((c) => ((c.children?.length ?? 0) > 0 ? "1fr" : "0fr")).join(" ") || "1fr"
    );
  }
  return columns <= 1
    ? "1fr"
    : `repeat(auto-fit, minmax(min(100%, ${MIN_COLUMN_WIDTH}), 1fr))`;
}

/**
 * Plan ONE row: the inner `<section>` grid of columns. `alignItems`/`justify` are
 * the Section's content-alignment defaults; a ROW may override `verticalAlign`
 * (align its columns) and a column may override in turn. The row's OWN
 * `props.columns`/`columnBehavior`/`gap` drive its grid (so rows differ); a row
 * may also carry `backgroundColor` (a theme token, paints the row band) and
 * per-side `padding` (with per-side `*Unit`, rem default). All optional → a bare
 * row renders exactly as before.
 */
function planRowGrid(
  row: Block,
  planBlock: (b: Block) => ElementPlan,
  alignItems: string,
  justify: string,
  sectionGap: number,
): ElementPlan {
  const rp = (row.props ?? {}) as Record<string, unknown>;
  const cols = (row.children ?? []).filter(
    (c) => c.component === SECTION_COLUMN_COMPONENT,
  );
  const columns = num(rp.columns, cols.length || 1);
  const columnBehavior = str(rp.columnBehavior, "equal");
  const gap = num(rp.gap, sectionGap);
  // Row overrides the Section's vertical alignment for its own columns (absent →
  // inherit the passed-in section default).
  const rowAlign = rp.verticalAlign != null ? (ALIGN_ITEMS[str(rp.verticalAlign, "top")] ?? alignItems) : alignItems;
  const bg = str(rp.backgroundColor, "transparent");
  const style: Record<string, string | number> = {
    display: "grid",
    gridTemplateColumns: rowGridCols(cols, columns, columnBehavior),
    gap: `${gap}px`,
    overflow: "hidden",
    paddingTop: pad(rp, "Top"),
    paddingRight: pad(rp, "Right"),
    paddingBottom: pad(rp, "Bottom"),
    paddingLeft: pad(rp, "Left"),
  };
  if (bg !== "transparent") style.backgroundColor = bg;
  return {
    kind: "element",
    tag: "section",
    props: { "data-section-row": row.id, style },
    children: cols.map((c) => planColumn(c, planBlock, rowAlign, justify)),
  };
}

/**
 * A standalone ROW (a `__section_row__` reached directly by planBlock, e.g. one
 * dragged loose) — render its grid with default alignment/gap.
 */
export function planRow(row: Block, planBlock: (b: Block) => ElementPlan): ElementPlan {
  return planRowGrid(row, planBlock, "flex-start", "flex-start", 16);
}

/**
 * The ROWS of a Section, GRANDFATHER-AWARE: explicit `__section_row__` children if
 * present, otherwise the whole Section treated as ONE implicit row (its direct
 * `__section_column__` children). Mirrors the pure `sectionRows` in page-blocks so
 * renderer + editor agree. Legacy column-direct sections render exactly as before.
 */
function sectionRowBlocks(block: Block): Block[] {
  const children = block.children ?? [];
  const rows = children.filter((c) => c.component === SECTION_ROW_COMPONENT);
  if (rows.length > 0) return rows;
  // Grandfather: no explicit rows → the section itself is one row of its columns.
  return [block];
}

export function planSection(
  block: Block,
  planBlock: (b: Block) => ElementPlan,
): ElementPlan {
  const p = (block.props ?? {}) as Record<string, unknown>;
  const gap = num(p.gap, 16);
  const maxWidth = str(p.maxWidth, "1280px");
  // ONE shared padding unit for all four sides (user decision 2026-06-19). MIGRATE
  // legacy per-side units: a saved page only had `padding<Side>Unit` — treat Top's
  // as the shared one (default rem) so old pages don't silently flip to rem.
  const paddingUnit = str(p.paddingUnit, str(p.paddingTopUnit, "rem"));
  const bgColor = str(p.backgroundColor, "transparent");
  const colJustify = JUSTIFY[str(p.horizontalAlign, "left")] ?? "flex-start";
  const colAlignItems = ALIGN_ITEMS[str(p.verticalAlign, "top")] ?? "flex-start";

  const rows = sectionRowBlocks(block);
  const rowGrids = rows.map((row) =>
    planRowGrid(row, planBlock, colAlignItems, colJustify, gap),
  );

  // The centered content wrapper carries the Section padding + max-width; inside
  // it, rows stack vertically (a flex column, `gap` between rows). One grandfathered
  // row lays out identically to the pre-rows single-grid section.
  return {
    kind: "element",
    tag: "div",
    props: { "data-section": block.id, style: { backgroundColor: bgColor } },
    children: [
      {
        kind: "element",
        tag: "div",
        props: {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: `${gap}px`,
            paddingTop: pad(p, "Top", paddingUnit),
            paddingRight: pad(p, "Right", paddingUnit),
            paddingBottom: pad(p, "Bottom", paddingUnit),
            paddingLeft: pad(p, "Left", paddingUnit),
            maxWidth: maxWidth === "full" ? "100%" : maxWidth,
            margin: "0 auto",
          },
        },
        children: rowGrids,
      },
    ],
  };
}

/**
 * Per-column visibility → responsive utility classes (epic: per-viewport column
 * visibility). A column carries optional boolean props `hideMobile`/`hideTablet`/
 * `hideDesktop` (default false = visible everywhere). Each truthy flag emits the
 * matching `pb-hide-*` class, whose `@media` rule (in `utility-css.ts`) sets
 * `display:none` only within that breakpoint band. Inline styles can't hold
 * `@media`, so visibility MUST be class-driven — that's why this returns classes,
 * not a `style`. Returns "" when fully visible (caller omits `className`). PURE.
 */
export function columnVisibilityClass(props: Record<string, unknown> | undefined): string {
  const p = props ?? {};
  const out: string[] = [];
  if (p.hideMobile) out.push("pb-hide-mobile");
  if (p.hideTablet) out.push("pb-hide-tablet");
  if (p.hideDesktop) out.push("pb-hide-desktop");
  return out.join(" ");
}

export function planColumn(
  col: Block,
  planBlock: (b: Block) => ElementPlan,
  alignItems: string,
  justifyContent: string,
): ElementPlan {
  const hideClass = columnVisibilityClass(col.props);
  return {
    kind: "element",
    tag: "div",
    props: {
      "data-section-column": col.id,
      ...(hideClass ? { className: hideClass } : {}),
      style: columnStyle(col.props, alignItems, justifyContent),
    },
    // Each dropped block is wrapped so it can be told to FILL the column width or
    // WRAP to its content (per-block `props.width`). The wrapper also keeps a
    // text-root component (which can't take a style) layout-controllable.
    children: (col.children ?? []).map((b) => wrapBlockWidth(b, planBlock(b))),
  };
}

/**
 * Wrap one column child in a width-controlling div. `props.width`:
 *  - "fill" (default) → the block fills the column width (width:100%).
 *  - "auto"           → the block wraps to its content (the column's content
 *    alignment then positions it horizontally).
 * A column child is always a flex item of the column; `align-self` makes "fill"
 * stretch and "auto" honor the column's `align-items`.
 */
export function wrapBlockWidth(block: Block, el: ElementPlan): ElementPlan {
  const fill = str(block.props?.width, "fill") !== "auto";
  return {
    kind: "element",
    tag: "div",
    props: {
      "data-block-wrap": block.id,
      style: fill
        ? { width: "100%", alignSelf: "stretch" }
        : { width: "auto", maxWidth: "100%", alignSelf: "auto" },
    },
    children: [el],
  };
}
