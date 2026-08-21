#!/usr/bin/env node
/**
 * Section-spacing linter for a bizbeecms Site (dev-time; talks to the admin API).
 *
 * Rule: adjacent page Sections must not visually touch unless that is a design
 * decision. Layout can't be measured without a browser, so the lint enforces the
 * decision itself at the authoring level: every top-level `Section` block must
 * DECLARE its vertical padding — `paddingTop` and `paddingBottom` present as
 * numbers in its props. An explicit `0` means "this edge touches by design /
 * spacing is handled inside the section's components" and passes; an ABSENT
 * value is an undeclared default (the exact state that ships cramped sections)
 * and fails.
 *
 * Pages come from `GET /api/pages`; each page's DRAFT blocks are checked (what
 * the next publish will ship). Requires the dev server's admin bypass
 * (CMS_DEV_SUPERADMIN) or an authenticated context — this is a dev lint, not a
 * public-page check (rendered HTML can't distinguish explicit 0 from unset).
 *
 * Usage:  node CMS/scripts/lint-section-padding.mjs [baseUrl]
 *         (default baseUrl: http://localhost:3602)
 * Exit codes: 0 = clean, 1 = violations found, 2 = could not lint.
 */

const base = new URL(process.argv[2] ?? "http://localhost:3602");

/**
 * Lint one page's top-level blocks. PURE — returns error strings.
 * Only `Section` blocks are checked; other top-level blocks (rare) are skipped.
 */
export function lintSectionBlocks(pageLabel, blocks) {
  const errors = [];
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (block?.component !== "Section") continue;
    const props = block.props ?? {};
    const name = typeof props.name === "string" && props.name ? props.name : block.id;
    const missing = ["paddingTop", "paddingBottom"].filter(
      (side) => typeof props[side] !== "number",
    );
    if (missing.length > 0) {
      errors.push(
        `${pageLabel} › "${name}": ${missing.join(" + ")} not declared — set a value, or an explicit 0 if this edge touches by design`,
      );
    }
  }
  return errors;
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

    let allErrors = [];
    for (const page of list) {
      const label = "/" + (page.slug ?? page.id ?? "?");
      try {
        const draft = await fetchJson(new URL(`/api/pages/${page.id}/draft`, base));
        allErrors = allErrors.concat(lintSectionBlocks(label, draft.blocks));
      } catch (err) {
        allErrors.push(`${label}: fetch failed — ${err.message}`);
      }
    }

    if (allErrors.length > 0) {
      console.error(`✗ ${allErrors.length} problem(s) across ${list.length} page(s):\n`);
      for (const e of allErrors) console.error("  " + e);
      process.exit(1);
    }
    console.log(
      `✓ ${list.length} page(s) clean — every Section declares its vertical padding (explicit 0 = touches by design).`,
    );
  } catch (err) {
    console.error(`lint failed: ${err.message}`);
    process.exit(2);
  }
}
