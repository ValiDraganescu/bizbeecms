#!/usr/bin/env node
/**
 * Repeated-items size linter for a bizbeecms Site (dev-time; admin API).
 *
 * Rule: repeatable items that are not staggered by design must render the SAME
 * size, and images inside repeatable items must render the same size. Layout
 * can't be measured without a browser, so the lint checks the authoring pattern
 * that guarantees it:
 *
 * A "repeated row" is a section row whose columns (>= 2) each hold exactly one
 * block of the SAME component. For each repeated row:
 *   1. If the component's root is card-like (its class paints a box: `bg-*` or
 *      `border`), unequal heights are visible, so the row must use the
 *      equal-height pattern: effective verticalAlign "stretch" (row prop, or
 *      inherited from the section) AND `h-full` on the component root.
 *      Text-only repeats (no painted box) are skipped — their height is
 *      invisible and stretching adds nothing.
 *   2. Every `<img>` the component renders must pin its rendered size with
 *      classes: `object-cover` plus an aspect (`aspect-*`) or height (`h-*`)
 *      utility. Without that, each photo's intrinsic ratio decides the height
 *      and the row staggers.
 *
 * Deliberately-staggered designs opt out per component:
 *   node CMS/scripts/lint-repeated-items.mjs [baseUrl] --ignore Comp1,Comp2
 *
 * Usage:  node CMS/scripts/lint-repeated-items.mjs [baseUrl] [--ignore names]
 *         (default baseUrl: http://localhost:3602)
 * Exit codes: 0 = clean, 1 = violations found, 2 = could not lint.
 */

const args = process.argv.slice(2);
const ignoreIdx = args.indexOf("--ignore");
const ignored = new Set(
  ignoreIdx !== -1 ? (args[ignoreIdx + 1] ?? "").split(",").filter(Boolean) : [],
);
const base = new URL(args.find((a) => !a.startsWith("--") && a !== args[ignoreIdx + 1]) ?? "http://localhost:3602");

const SECTION = "Section";
const ROW = "__section_row__";
const COLUMN = "__section_column__";

/** Find repeated rows in one page's blocks. PURE. Returns
 *  [{sectionName, rowId, component, count, effVAlign}]. */
export function findRepeatedRows(blocks) {
  const out = [];
  for (const sec of Array.isArray(blocks) ? blocks : []) {
    if (sec?.component !== SECTION) continue;
    const secProps = sec.props ?? {};
    for (const row of sec.children ?? []) {
      if (row?.component !== ROW) continue;
      const cols = (row.children ?? []).filter((c) => c?.component === COLUMN);
      if (cols.length < 2) continue;
      const sigs = cols.map((c) => (c.children ?? []).map((b) => b?.component).join("+"));
      const first = sigs[0];
      if (!first || first.includes("+") || sigs.some((s) => s !== first)) continue;
      out.push({
        sectionName: typeof secProps.name === "string" && secProps.name ? secProps.name : sec.id,
        rowId: row.id,
        component: first,
        count: cols.length,
        effVAlign: (row.props ?? {}).verticalAlign ?? secProps.verticalAlign ?? "top",
      });
    }
  }
  return out;
}

const hasUtil = (cls, re) => typeof cls === "string" && re.test(cls);
const CARD_LIKE = /(?:^|[\s:])(?:bg-|border\b|border-)/;
const H_FULL = /(?:^|[\s:])h-full(?:\s|$)/;
const OBJ_COVER = /(?:^|[\s:])object-cover(?:\s|$)/;
const SIZE_PIN = /(?:^|[\s:])(?:aspect-|h-)/;

/**
 * Lint one repeated row against the component's markup info. PURE.
 * `info` = { rootClass: string, imgClasses: string[] } for the repeated component.
 */
export function lintRepeatedRow(pageLabel, row, info) {
  const errors = [];
  const where = `${pageLabel} › "${row.sectionName}" row ${row.rowId} (${row.count}× ${row.component})`;

  if (hasUtil(info.rootClass, CARD_LIKE)) {
    if (row.effVAlign !== "stretch") {
      errors.push(`${where}: repeated cards need verticalAlign "stretch" on the row (or section) for equal heights`);
    }
    if (!hasUtil(info.rootClass, H_FULL)) {
      errors.push(`${where}: component root needs h-full so each card fills its stretched column`);
    }
  }

  for (const cls of info.imgClasses) {
    if (!(hasUtil(cls, OBJ_COVER) && hasUtil(cls, SIZE_PIN))) {
      errors.push(
        `${where}: <img> must pin its size (object-cover + aspect-* or h-*) so repeated images match — got class "${cls || "(none)"}"`,
      );
    }
  }
  return errors;
}

/** Extract {rootClass, imgClasses} from a component export (tree or html kind). PURE. */
export function componentMarkupInfo(component) {
  if (component?.tree && typeof component.tree === "object") {
    const imgs = [];
    const walk = (n) => {
      if (!n || typeof n !== "object") return;
      if (n.tag === "img") imgs.push(String(n.props?.className ?? ""));
      for (const c of n.children ?? []) walk(c);
    };
    walk(component.tree);
    return { rootClass: String(component.tree.props?.className ?? ""), imgClasses: imgs };
  }
  const html = typeof component?.html === "string" ? component.html : "";
  const rootMatch = html.match(/<[a-z][^>]*\bclass\s*=\s*"([^"]*)"/i);
  const imgClasses = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => {
    const c = m[0].match(/\bclass\s*=\s*"([^"]*)"/i);
    return c ? c[1] : "";
  });
  return { rootClass: rootMatch ? rootMatch[1] : "", imgClasses };
}

async function fetchJson(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

// Import-safe: only run the fetch loop when executed directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const pages = await fetchJson(new URL("/api/pages", base));
    const list = Array.isArray(pages) ? pages : (pages.pages ?? []);
    if (list.length === 0) {
      console.error(`no pages returned by ${new URL("/api/pages", base)} — is the dev server up?`);
      process.exit(2);
    }

    const infoCache = new Map();
    const componentInfo = async (name) => {
      if (!infoCache.has(name)) {
        const exported = await fetchJson(new URL(`/api/components?name=${encodeURIComponent(name)}`, base));
        infoCache.set(name, componentMarkupInfo(exported.component ?? exported));
      }
      return infoCache.get(name);
    };

    let allErrors = [];
    let repeatedRows = 0;
    for (const page of list) {
      const label = "/" + (page.slug ?? page.id ?? "?");
      try {
        const draft = await fetchJson(new URL(`/api/pages/${page.id}/draft`, base));
        for (const row of findRepeatedRows(draft.blocks)) {
          if (ignored.has(row.component)) continue;
          repeatedRows++;
          let info;
          try {
            info = await componentInfo(row.component);
          } catch {
            continue; // builtin/unfetchable component — nothing static to check
          }
          allErrors = allErrors.concat(lintRepeatedRow(label, row, info));
        }
      } catch (err) {
        allErrors.push(`${label}: fetch failed — ${err.message}`);
      }
    }

    if (allErrors.length > 0) {
      console.error(`✗ ${allErrors.length} problem(s) across ${repeatedRows} repeated row(s):\n`);
      for (const e of allErrors) console.error("  " + e);
      process.exit(1);
    }
    console.log(
      `✓ ${repeatedRows} repeated row(s) across ${list.length} page(s) clean — cards stretch to equal height, repeated images pin their size.`,
    );
  } catch (err) {
    console.error(`lint failed: ${err.message}`);
    process.exit(2);
  }
}
