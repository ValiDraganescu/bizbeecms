#!/usr/bin/env node
/**
 * External-link linter for a rendered bizbeecms Site.
 *
 * Checks the skill rule "external links open in a new tab" against the ACTUAL
 * served HTML (so it validates the renderer's companion-flag output, not the
 * authoring intent):
 *   - every anchor to a DIFFERENT host must carry target="_blank" AND a rel
 *     containing "noopener";
 *   - internal navigation, tel: and mailto: anchors must NOT carry
 *     target="_blank" (same-tab rule).
 *
 * Pages are discovered from /sitemap.xml (public, includes every locale URL via
 * its hreflang alternates), so the lint covers all published pages in all
 * content locales. Sitemap <loc> origins (the canonical site host) are treated
 * as internal even when they differ from the base URL used to fetch.
 *
 * Usage:  node CMS/scripts/lint-external-links.mjs [baseUrl]
 *         (default baseUrl: http://localhost:3602)
 * Exit codes: 0 = clean, 1 = violations found, 2 = could not lint.
 */

const base = new URL(process.argv[2] ?? "http://localhost:3602");

/** Hosts considered "internal": the host we fetch from + hosts the sitemap
 *  declares as the site's own (canonical origin behind the router). */
const internalHosts = new Set([base.host]);

async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

/** All page paths (with locale prefixes) from the sitemap, deduped. */
async function discoverPaths() {
  const xml = await fetchText(new URL("/sitemap.xml", base));
  const urls = [...xml.matchAll(/(?:<loc>|href=")(https?:\/\/[^<"]+)/g)].map((m) => m[1]);
  const paths = new Set();
  for (const u of urls) {
    try {
      const parsed = new URL(u);
      internalHosts.add(parsed.host);
      paths.add(parsed.pathname);
    } catch {
      /* malformed loc — skip */
    }
  }
  return [...paths].sort();
}

/** Parse anchor tags out of HTML. Attribute-order-agnostic; good enough for
 *  lint purposes (server-rendered markup, no exotic quoting). */
function anchors(html) {
  return [...html.matchAll(/<a\s[^>]*>/gi)].map((m) => {
    const tag = m[0];
    const attr = (name) => {
      const a = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"));
      return a ? a[1] : null;
    };
    return { tag, href: attr("href"), target: attr("target"), rel: attr("rel") ?? "" };
  });
}

function lintPage(path, html) {
  const errors = [];
  for (const a of anchors(html)) {
    if (!a.href || a.href.startsWith("#") || a.href.startsWith("javascript:")) continue;

    let external = false;
    if (/^https?:\/\//i.test(a.href)) {
      try {
        external = !internalHosts.has(new URL(a.href).host);
      } catch {
        errors.push(`${path}: malformed href "${a.href}"`);
        continue;
      }
    }

    if (external) {
      if (a.target !== "_blank") {
        errors.push(`${path}: external link missing target="_blank" → ${a.href}`);
      } else if (!/\bnoopener\b/.test(a.rel)) {
        errors.push(`${path}: external link missing rel="noopener" → ${a.href}`);
      }
    } else if (a.target === "_blank") {
      errors.push(`${path}: internal/tel/mailto link must stay same-tab → ${a.href}`);
    }
  }
  return errors;
}

try {
  const paths = await discoverPaths();
  if (paths.length === 0) {
    console.error(`no pages found in ${new URL("/sitemap.xml", base)} — is the site up?`);
    process.exit(2);
  }

  let allErrors = [];
  let checked = 0;
  for (const path of paths) {
    try {
      const html = await fetchText(new URL(path, base));
      allErrors = allErrors.concat(lintPage(path, html));
      checked++;
    } catch (err) {
      allErrors.push(`${path}: fetch failed — ${err.message}`);
    }
  }

  if (allErrors.length > 0) {
    console.error(`✗ ${allErrors.length} problem(s) across ${checked} page(s):\n`);
    for (const e of allErrors) console.error("  " + e);
    process.exit(1);
  }
  console.log(`✓ ${checked} page(s) clean — every external link opens in a new tab with rel="noopener", internal/tel/mailto links stay same-tab.`);
} catch (err) {
  console.error(`lint failed: ${err.message}`);
  process.exit(2);
}
