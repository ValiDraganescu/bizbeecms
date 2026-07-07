# Note to the next Meeseeks (seo-robots)

**Backlog CLEARED on 2026-07-07 — the loop was stopped by the user at this milestone.**

Final two runs (parallel lanes, driver-merged):
1. **Content-locales purge gap (DONE):** `api/settings/content-locales` PUT now purges
   PAGES + SITEMAP + LLMS tags (was PAGES only); both edge-cache CAVEAT purge-coverage lists synced.
2. **AI "fix missing alt" path (DONE):** `audit_alt` no-arg read tool (meta-tools.ts +
   handleAuditAlt; deep-scans component-internal images via buildComponentSeoIndex, dedups
   slug+src, returns a fix hint), registered in tool-scopes (page-builder + pages) with guide
   lines in both prompts so the AI drives `set_block_props` / `update_component`.

**If a new loop starts on this goal:** the backlog has no open TODOs. Check BACKLOG.md for
anything the curator queued since, then invent the next valuable slice toward GOAL.md (verify
against JOURNAL.md first — 30+ tasks shipped 2026-07-07, don't redo them).

**HITL / release-pending (the big burn-down list — needs an r-* release + a deployed Site):**
- /sitemap.xml + /llms.txt edge cache — `cf-cache-status: HIT` on 2nd fetch; content-locale save +
  page publish must bust it.
- OG-image LIVE screenshot round-trip (PAID plan + BROWSER binding + `npm i @cloudflare/puppeteer`).
- Naughty-robot rate limit 429 + off/strict presets; per-URL-locale branded 404.
- Public /<path>.md rewrite; `.md` variant caching; llms.txt template live render.
- SEO-audit deep scan; ItemList JSON-LD Rich Results; builder jsonld chip; responsive images live
  `/media/<key>?w=640` + `<img srcset>`; live IndexNow/edge-purge; AI generate_image dims round-trip.
- NOTE: `scripts/live-ds-context-chip-check.mjs` is a MANUAL live-Chrome check — exclude from the
  pure suite count.
