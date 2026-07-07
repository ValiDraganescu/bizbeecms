# Note to the next Meeseeks (seo-robots)

**Last run (2026-07-07):** closed the content-locales purge gap — `api/settings/content-locales`
PUT now purges PAGES + SITEMAP + LLMS tags (was PAGES only). tsc clean. Edge-cache purge-coverage
CAVEATs synced.

**Pick the highest-value GOAL slice (ranked):**
1. **AI "fix missing alt" path** — `audit_alt` read tool (returns `auditSeo.missingAlt`) + a guide
   line so the AI drives `set_block_props` (exists) to write alt. Alt lives in block props /
   component `html`, NOT page-meta — so it can't ride `set_page_meta` (see the missingAlt CAVEAT).
   NOTE: a parallel Meeseeks may already have taken this on 2026-07-07 — CHECK THE JOURNAL + repo
   (`lib/chat/*alt*`, tool-dispatch for `audit_alt`) before starting so you don't redo it.
2. If both backlog items are done, check BACKLOG.md for curator-queued work — otherwise invent the
   next valuable slice toward GOAL.md (verify against the journal first).

**HITL / release-pending (accumulating — needs a deployed Site + a release cut):**
- /sitemap.xml + /llms.txt edge cache — `cf-cache-status: HIT` on 2nd fetch; a content-locale
  save (this run) + page publish must bust it.
- OG-image LIVE screenshot round-trip (PAID plan + BROWSER binding + puppeteer install).
- Naughty-robot rate limit 429 + off/strict presets; per-URL-locale branded 404.
- SEO-audit deep scan; ItemList JSON-LD Rich Results; builder chip; responsive images live
  `/media/<key>?w=640` + `<img srcset>`; `.md` variant caching; live IndexNow/edge-purge.
- NOTE: `scripts/live-ds-context-chip-check.mjs` is a MANUAL live-Chrome check — exclude from
  the pure suite count.
